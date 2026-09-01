import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { and, asc, count, desc, eq, getTableColumns, isNull } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import type { TenantTransaction } from '../../database/database.types';
import {
  customers,
  projects,
  quotationLines,
  quotationPaymentTerms,
  quotations,
  tenants,
  type QuoteStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { autoAdvanceProject } from '../projects/project-auto-advance';
import type { QuotationDocumentRow } from './quotation-document.mapper';
import { buildSpecSummary } from './quote-spec';

export type QuotationRecord = typeof quotations.$inferSelect;
export type QuotationInsert = typeof quotations.$inferInsert;
export type QuotationLineRecord = typeof quotationLines.$inferSelect;
export type QuotationLineInsert = typeof quotationLines.$inferInsert;
export type QuotationPaymentTermRecord =
  typeof quotationPaymentTerms.$inferSelect;

/** Everything a caller may set on a line — identity and print order are ours. */
export type QuotationLineValues = Omit<
  QuotationLineInsert,
  'tenantId' | 'id' | 'quotationId' | 'sequence' | 'createdAt' | 'updatedAt'
>;

/** One row of the schedule, before it is sequenced. */
export interface PaymentTermInput {
  label: string;
  percent: string;
  triggerEvent?: string | null;
}

/** The commercial prose columns, patched field-by-field. */
export type QuotationTermsUpdate = Partial<
  Pick<
    QuotationInsert,
    | 'referenceCode'
    | 'deliveryDays'
    | 'warrantyPartsMonths'
    | 'warrantyFreeServiceMonths'
    | 'validityDays'
  >
>;

/** What a negotiated grand total writes onto the header. */
export interface QuotationPricingUpdate {
  subtotalEtb: string;
  marginAmountEtb: string;
  taxAmountEtb: string;
  totalPriceEtb: string;
  calculatedTotalEtb: string;
  discountAmountEtb: string;
  discountPercent: string;
}

/** ...and onto each line. */
export interface QuotationLineAmount {
  id: string;
  unitPriceEtb: string;
  lineTotalEtb: string;
}

@Injectable()
export class QuotationsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      projectId?: string;
      status?: QuoteStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<QuotationRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [isNull(quotations.deletedAt)];
      if (options.projectId) {
        filters.push(eq(quotations.projectId, options.projectId));
      }
      if (options.status) {
        filters.push(eq(quotations.status, options.status));
      }
      const where = and(...filters);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(quotations)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(quotations)
        .where(where)
        .orderBy(desc(quotations.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<QuotationRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(quotations)
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Same row as findById, plus the customer/project display names the
   * document templates need (QuotationRecord only has customerId/projectId
   * — see quotation-document.mapper.ts). Joined here rather than fetched via
   * ProjectsService/CustomersService: one query, and it keeps the document
   * endpoint from adding a new cross-module service dependency for two
   * display strings.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<QuotationDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(quotations),
          customerName: customers.name,
          projectName: projects.name,
        })
        .from(quotations)
        .leftJoin(
          customers,
          and(eq(quotations.tenantId, customers.tenantId), eq(quotations.customerId, customers.id)),
        )
        .leftJoin(
          projects,
          and(eq(quotations.tenantId, projects.tenantId), eq(quotations.projectId, projects.id)),
        )
        .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Inserts the quotation and moves its project to QUOTATION in the SAME
   * transaction — quoting IS the event that defines the stage, so nobody has
   * to record it a second time by hand. autoAdvanceProject is a silent no-op
   * when the project is already at or past QUOTATION, or is CANCELLED, and
   * never throws: a stage that cannot move must not fail the quotation.
   */
  async create(
    tenantId: string,
    values: QuotationInsert,
  ): Promise<QuotationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx.insert(quotations).values(values).returning();
      if (!row) {
        throw new Error('Failed to insert quotation');
      }
      await autoAdvanceProject(tx, row.projectId, 'QUOTATION');
      return row;
    });
  }

  /**
   * Compare-and-swap, matching the current ProjectsRepository.updateStatus
   * idiom: the update only lands if the quotation is still in
   * `expectedStatus`, so two concurrent transitions cannot both apply. On a
   * miss, distinguishes "someone else already moved it" (409) from "it
   * doesn't exist" (404).
   */
  async updateStatus(
    tenantId: string,
    id: string,
    expectedStatus: QuoteStatus,
    status: QuoteStatus,
    extra: Partial<
      Pick<QuotationInsert, 'approvedByUserId' | 'approvedAt' | 'rejectedReason'>
    > = {},
  ): Promise<QuotationRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(quotations)
        .set({ status, statusChangedAt: now, updatedAt: now, ...extra })
        .where(
          and(
            eq(quotations.id, id),
            eq(quotations.status, expectedStatus),
            isNull(quotations.deletedAt),
          ),
        )
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: quotations.id })
          .from(quotations)
          .where(and(eq(quotations.id, id), isNull(quotations.deletedAt)))
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Quotation status changed concurrently — reload and retry',
          );
        }
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }

  // -------------------------------------------------------------------------
  // Line items (page 1's table). Every write below is DRAFT-only and takes
  // the gate INSIDE its own transaction, so a concurrent submit cannot slip
  // a line onto a quotation that has already left DRAFT.
  // -------------------------------------------------------------------------

  /**
   * The quotation's lines in print order.
   *
   * BACKWARD COMPATIBILITY: a quotation written before this table existed has
   * its whole spec on the header jsonb and no rows here, so one line is
   * SYNTHESIZED from the header rather than backfilled by a data migration
   * (see legacyLineRecord). Chosen over a migration because the backfill has
   * to invent nothing this way, cannot half-apply across tenants under RLS,
   * and stays correct for quotations created by the unchanged
   * `createForProject` path — which still writes only a header. The row is
   * materialized for real the first time anyone edits the lines.
   */
  async listLines(
    tenantId: string,
    quotationId: string,
  ): Promise<QuotationLineRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireQuotation(tx, quotationId);
      const rows = await persistedLines(tx, quotationId);
      return rows.length > 0 ? rows : [legacyLineRecord(quotation)];
    });
  }

  async addLine(
    tenantId: string,
    quotationId: string,
    values: QuotationLineValues,
  ): Promise<QuotationLineRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireDraft(tx, quotationId);
      const existing = await materializeLegacyLine(tx, tenantId, quotation);
      const nextSequence = (existing.at(-1)?.sequence ?? 0) + 1;
      const [row] = await tx
        .insert(quotationLines)
        .values({ ...values, tenantId, quotationId, sequence: nextSequence })
        .returning();
      if (!row) {
        throw new Error('Failed to insert quotation line');
      }
      await resyncHeaderFromLines(tx, quotation);
      return row;
    });
  }

  async updateLine(
    tenantId: string,
    quotationId: string,
    lineId: string,
    values: QuotationLineValues,
  ): Promise<QuotationLineRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireDraft(tx, quotationId);
      await materializeLegacyLine(tx, tenantId, quotation);
      const [row] = await tx
        .update(quotationLines)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(quotationLines.id, lineId),
            eq(quotationLines.quotationId, quotationId),
          ),
        )
        .returning();
      if (!row) {
        throw new NotFoundException('Quotation line not found');
      }
      await resyncHeaderFromLines(tx, quotation);
      return row;
    });
  }

  /**
   * Removes a line and closes the gap in the print order. Refuses to remove
   * the LAST line: a quotation with no lines would fall straight back to the
   * synthesized legacy line on the next read, silently resurrecting what was
   * just deleted.
   */
  async removeLine(
    tenantId: string,
    quotationId: string,
    lineId: string,
  ): Promise<QuotationLineRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireDraft(tx, quotationId);
      const existing = await materializeLegacyLine(tx, tenantId, quotation);
      if (!existing.some((line) => line.id === lineId)) {
        throw new NotFoundException('Quotation line not found');
      }
      if (existing.length === 1) {
        throw new BadRequestException(
          'A quotation must keep at least one line item — edit this one instead of removing it.',
        );
      }
      await tx
        .delete(quotationLines)
        .where(
          and(
            eq(quotationLines.id, lineId),
            eq(quotationLines.quotationId, quotationId),
          ),
        );
      const remaining = existing.filter((line) => line.id !== lineId);
      const resequenced = await resequence(
        tx,
        quotationId,
        remaining.map((line) => line.id),
      );
      await resyncHeaderFromLines(tx, quotation);
      return resequenced;
    });
  }

  /** `lineIds` must be every line of the quotation, in the order they take. */
  async reorderLines(
    tenantId: string,
    quotationId: string,
    lineIds: readonly string[],
  ): Promise<QuotationLineRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireDraft(tx, quotationId);
      const existing = await materializeLegacyLine(tx, tenantId, quotation);
      const current = new Set(existing.map((line) => line.id));
      const wanted = new Set(lineIds);
      if (
        wanted.size !== lineIds.length ||
        wanted.size !== current.size ||
        lineIds.some((id) => !current.has(id))
      ) {
        throw new BadRequestException(
          `lineIds must list each of the quotation's ${current.size} line(s) exactly once`,
        );
      }
      return resequence(tx, quotationId, lineIds);
    });
  }

  // -------------------------------------------------------------------------
  // Negotiated pricing and the commercial terms.
  // -------------------------------------------------------------------------

  /**
   * Writes the negotiated total onto the header and its allocated share onto
   * every line, in ONE transaction — the header's `subtotal_etb` is the sum
   * of the lines' `line_total_etb`, and a partial write would break that
   * invariant on a document an auditor reads.
   *
   * `amounts` must name exactly the lines that are there: the service reads
   * them, does the arithmetic outside a transaction, and comes back, so a
   * line added in between would otherwise be silently priced at nothing.
   */
  async applyPricing(
    tenantId: string,
    quotationId: string,
    header: QuotationPricingUpdate,
    amounts: readonly QuotationLineAmount[],
  ): Promise<QuotationRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const quotation = await requireDraft(tx, quotationId);
      const existing = await materializeLegacyLine(tx, tenantId, quotation);
      const priced = new Set(amounts.map((amount) => amount.id));
      if (
        priced.size !== amounts.length ||
        priced.size !== existing.length ||
        existing.some((line) => !priced.has(line.id))
      ) {
        throw new WorkflowTransitionError(
          'The quotation\'s line items changed while it was being priced — reload and price it again',
        );
      }

      for (const amount of amounts) {
        await tx
          .update(quotationLines)
          .set({
            unitPriceEtb: amount.unitPriceEtb,
            lineTotalEtb: amount.lineTotalEtb,
            updatedAt: now,
          })
          .where(
            and(
              eq(quotationLines.id, amount.id),
              eq(quotationLines.quotationId, quotationId),
            ),
          );
      }

      const [row] = await tx
        .update(quotations)
        .set({
          ...header,
          // Re-pricing INVALIDATES any sign-off. The stamp records who
          // approved, never what they approved, so leaving it set let an
          // approved 4% discount be re-priced to 40% and submitted with the
          // old signature still attached — assertDiscountApproved
          // short-circuits on the stamp's presence and never re-checks the
          // threshold. Clearing it here means a bigger discount must be
          // signed off again.
          discountApprovedByUserId: null,
          updatedAt: now,
        })
        .where(eq(quotations.id, quotationId))
        .returning();
      if (!row) {
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }

  /** Stamps who signed the discount off. DRAFT only — see submit(). */
  async setDiscountApprovedBy(
    tenantId: string,
    quotationId: string,
    userId: string,
  ): Promise<QuotationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await requireDraft(tx, quotationId);
      const [row] = await tx
        .update(quotations)
        .set({ discountApprovedByUserId: userId, updatedAt: new Date() })
        .where(eq(quotations.id, quotationId))
        .returning();
      if (!row) {
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }

  /**
   * NULL — the default — means no discount ever needs approval. Read from
   * the tenants row directly rather than through SettingsService, the same
   * way ContractsRepository reads `fiscalYearStart`: one query, no
   * cross-module service dependency for one number.
   */
  async getDiscountApprovalThresholdPercent(
    tenantId: string,
  ): Promise<string | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          threshold: tenants.discountApprovalThresholdPercent,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Tenant not found');
      }
      return row.threshold;
    });
  }

  async updateTerms(
    tenantId: string,
    quotationId: string,
    patch: QuotationTermsUpdate,
  ): Promise<QuotationRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await requireDraft(tx, quotationId);
      if (Object.keys(patch).length === 0) {
        const [row] = await tx
          .select()
          .from(quotations)
          .where(eq(quotations.id, quotationId))
          .limit(1);
        return row!;
      }
      const [row] = await tx
        .update(quotations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(quotations.id, quotationId))
        .returning();
      if (!row) {
        throw new NotFoundException('Quotation not found');
      }
      return row;
    });
  }

  async listPaymentTerms(
    tenantId: string,
    quotationId: string,
  ): Promise<QuotationPaymentTermRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await requireQuotation(tx, quotationId);
      return tx
        .select()
        .from(quotationPaymentTerms)
        .where(eq(quotationPaymentTerms.quotationId, quotationId))
        .orderBy(asc(quotationPaymentTerms.sequence));
    });
  }

  /**
   * Replace-all, matching ContractInstalmentsRepository.replaceSchedule: a
   * schedule is edited as a whole (four rows become three), and nothing
   * downstream holds a reference to a quotation payment-term row.
   */
  async replacePaymentTerms(
    tenantId: string,
    quotationId: string,
    terms: readonly PaymentTermInput[],
  ): Promise<QuotationPaymentTermRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      await requireDraft(tx, quotationId);
      await tx
        .delete(quotationPaymentTerms)
        .where(eq(quotationPaymentTerms.quotationId, quotationId));
      if (terms.length === 0) {
        return [];
      }
      return tx
        .insert(quotationPaymentTerms)
        .values(
          terms.map((term, index) => ({
            tenantId,
            quotationId,
            sequence: index + 1,
            label: term.label,
            percent: term.percent,
            triggerEvent: term.triggerEvent ?? null,
          })),
        )
        .returning();
    });
  }
}

const persistedLines = (
  tx: TenantTransaction,
  quotationId: string,
): Promise<QuotationLineRecord[]> =>
  tx
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotationId))
    .orderBy(asc(quotationLines.sequence));

const requireQuotation = async (
  tx: TenantTransaction,
  quotationId: string,
): Promise<QuotationRecord> => {
  const [row] = await tx
    .select()
    .from(quotations)
    .where(
      and(eq(quotations.id, quotationId), isNull(quotations.deletedAt)),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundException('Quotation not found');
  }
  return row;
};

/**
 * Lines are immutable once the quotation leaves DRAFT. Not "editable but
 * audited": past DRAFT the quotation has been submitted for approval and
 * then sent, and the customer holds a copy of what it said.
 */
/**
 * Rewrites the header money from whatever the lines now say, at LIST price.
 *
 * Called after every line mutation. Without it, adding a second lift left
 * the header — and therefore the issued proforma and the invoice raised
 * from it — billing only the first one, because nothing forced a pricing
 * run before submit.
 *
 * Any negotiated figure is deliberately discarded: a round total agreed for
 * a one-lift scope is not a price for a two-lift scope, and silently
 * carrying it over would bill the customer the old number for new work. The
 * sign-off goes with it, so a re-negotiated price is signed off again.
 */
const resyncHeaderFromLines = async (
  tx: TenantTransaction,
  quotation: QuotationRecord,
): Promise<void> => {
  const lines = await tx
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotation.id))
    .orderBy(asc(quotationLines.sequence));

  const subtotal = lines.reduce(
    // lineTotalEtb is nullable in the column type but written on every
    // insert; treat an absent one as zero rather than throwing mid-resync.
    (sum, line) => sum.plus(new Decimal(line.lineTotalEtb ?? 0)),
    new Decimal(0),
  );
  const tax = subtotal
    .mul(new Decimal(quotation.taxPercent).div(100))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  await tx
    .update(quotations)
    .set({
      subtotalEtb: subtotal.toFixed(2),
      taxAmountEtb: tax.toFixed(2),
      totalPriceEtb: subtotal.plus(tax).toFixed(2),
      calculatedTotalEtb: null,
      discountAmountEtb: null,
      discountPercent: null,
      discountApprovedByUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(quotations.id, quotation.id));
};

const requireDraft = async (
  tx: TenantTransaction,
  quotationId: string,
): Promise<QuotationRecord> => {
  const row = await requireQuotation(tx, quotationId);
  if (row.status !== 'DRAFT') {
    throw new WorkflowTransitionError(
      `Quotation is ${row.status} — its line items and terms are fixed once it leaves DRAFT. Create a new revision instead.`,
    );
  }
  return row;
};

/**
 * The one line a pre-lines quotation implies, built from the header jsonb.
 *
 * `lineTotalEtb` is the EX-VAT SELLING PRICE (totalPriceEtb - taxAmountEtb),
 * not the header's pre-margin `subtotalEtb`: it keeps "line table sums to
 * the totals block" true for legacy quotations too, and it leaves the
 * legacy document
 * rendering byte-for-byte as it does today (its Subtotal / Margin / VAT /
 * Total block is unchanged and still adds up).
 */
const legacyLineValues = (
  quotation: QuotationRecord,
): Omit<
  QuotationLineRecord,
  'tenantId' | 'id' | 'quotationId' | 'sequence' | 'createdAt' | 'updatedAt'
> => {
  const calcInput = (quotation.calcInput ?? {}) as {
    productType?: string;
    capacityKg?: number;
    speedMs?: number;
  };
  const technical = (quotation.technicalSpec ?? {}) as {
    capacityPersons?: number | null;
  };
  // The line's money is the EX-VAT TOTAL, derived as totalPriceEtb -
  // taxAmountEtb — never `quotation.subtotalEtb`, which is the PRE-margin
  // cost base. The documents print this line table directly above a totals
  // block whose "Total price" is that same ex-VAT figure, so using the
  // pre-margin column made the customer's page fail to add up by exactly
  // marginAmountEtb — handing them the tenant's markup by subtraction.
  // Both columns are NOT NULL numeric(14,2), so this is exact.
  const exVatTotalEtb = new Decimal(quotation.totalPriceEtb)
    .minus(quotation.taxAmountEtb)
    .toFixed(2);
  return {
    productType: calcInput.productType ?? 'PASSENGER',
    calcInput: quotation.calcInput,
    technicalSpec: quotation.technicalSpec,
    pricingBreakdown: quotation.pricingBreakdown,
    specSummary: buildSpecSummary({
      capacityKg: calcInput.capacityKg,
      capacityPersons: technical.capacityPersons,
      speedMs: calcInput.speedMs,
    }),
    quantity: 1,
    unitPriceEtb: exVatTotalEtb,
    lineTotalEtb: exVatTotalEtb,
    machineRoomLabel: null,
    floorLabels: null,
    floorDisplaySummary: null,
    doorHeightMm: null,
    ropingRatio: null,
    tractionMachineType: null,
    controlSystem: null,
    powerSupply: null,
    lightSupply: null,
    entranceCount: null,
  };
};

/**
 * The synthesized read-path row. `id` is the quotation's OWN id, and
 * materializeLegacyLine below inserts under that same id — so the line a
 * client read keeps its identity when it becomes a real row, and a pricing
 * run that reads the lines and then writes them back still recognises them.
 */
const legacyLineRecord = (quotation: QuotationRecord): QuotationLineRecord => ({
  ...legacyLineValues(quotation),
  tenantId: quotation.tenantId,
  id: quotation.id,
  quotationId: quotation.id,
  sequence: 1,
  createdAt: quotation.createdAt,
  updatedAt: quotation.updatedAt,
});

/**
 * Turns the synthesized legacy line into a real row the first time anyone
 * writes to the lines of a quotation that has none — otherwise appending a
 * second lift would make the first one vanish from the document.
 */
const materializeLegacyLine = async (
  tx: TenantTransaction,
  tenantId: string,
  quotation: QuotationRecord,
): Promise<QuotationLineRecord[]> => {
  const rows = await persistedLines(tx, quotation.id);
  if (rows.length > 0) {
    return rows;
  }
  return tx
    .insert(quotationLines)
    .values({
      ...legacyLineValues(quotation),
      tenantId,
      // Same id legacyLineRecord reported on the read path — see there.
      id: quotation.id,
      quotationId: quotation.id,
      sequence: 1,
    })
    .returning();
};

/**
 * Renumbers `lineIds` to 1..n. Two passes through the negatives because
 * `(tenant_id, quotation_id, sequence)` is UNIQUE: assigning the final
 * numbers directly collides with a row that still holds the number being
 * assigned.
 */
const resequence = async (
  tx: TenantTransaction,
  quotationId: string,
  lineIds: readonly string[],
): Promise<QuotationLineRecord[]> => {
  const now = new Date();
  for (const [index, id] of lineIds.entries()) {
    await tx
      .update(quotationLines)
      .set({ sequence: -(index + 1) })
      .where(
        and(
          eq(quotationLines.id, id),
          eq(quotationLines.quotationId, quotationId),
        ),
      );
  }
  for (const [index, id] of lineIds.entries()) {
    await tx
      .update(quotationLines)
      .set({ sequence: index + 1, updatedAt: now })
      .where(
        and(
          eq(quotationLines.id, id),
          eq(quotationLines.quotationId, quotationId),
        ),
      );
  }
  return persistedLines(tx, quotationId);
};
