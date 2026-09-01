import { Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

import { todayIso } from '../../common/business-time';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import {
  normalizePageQuery,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination';
import {
  customers,
  documentSequences,
  proformaLines,
  proformas,
  projects,
  quotationLines,
  quotationPaymentTerms,
  quotations,
  rateVersions,
  tenants,
  type ProformaPaymentTerm,
  type ProformaStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { autoAdvanceProject } from '../projects/project-auto-advance';
import type { ProformaDocumentRow } from './proforma-document.mapper';
import { buildProformaNumber } from './proforma-number';

export type ProformaRecord = typeof proformas.$inferSelect;
export type ProformaInsert = typeof proformas.$inferInsert;
export type ProformaLineRecord = typeof proformaLines.$inferSelect;

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const PROFORMA_SEQUENCE_KIND = 'PROFORMA';

@Injectable()
export class ProformasRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: {
      projectId?: string;
      status?: ProformaStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ProformaRecord>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const filters = [];
      if (options.projectId) {
        filters.push(eq(proformas.projectId, options.projectId));
      }
      if (options.status) {
        filters.push(eq(proformas.status, options.status));
      }
      const where = filters.length > 0 ? and(...filters) : undefined;
      const [totalRow] = await tx
        .select({ value: count() })
        .from(proformas)
        .where(where);
      const total = Number(totalRow?.value ?? 0);
      const items = await tx
        .select()
        .from(proformas)
        .where(where)
        .orderBy(desc(proformas.createdAt))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, total, page, pageSize);
    });
  }

  /**
   * Streams every proforma matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching, ties broken by the `id` tiebreaker below so
   * equal `createdAt` values (bulk import, seed data) no longer duplicate
   * or skip rows across batch boundaries — concurrent inserts/deletes can
   * still shift the offset window; acceptable for ad-hoc admin downloads,
   * switch to keyset cursor before this feeds accounting reconciliation.
   * Perf ceiling: keyset if large-tenant exports time out.
   */
  async *streamAll(
    tenantId: string,
    options: { projectId?: string; status?: ProformaStatus },
  ): AsyncGenerator<ProformaRecord> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) => {
        const filters = [];
        if (options.projectId) {
          filters.push(eq(proformas.projectId, options.projectId));
        }
        if (options.status) {
          filters.push(eq(proformas.status, options.status));
        }
        const where = filters.length > 0 ? and(...filters) : undefined;
        return tx
          .select()
          .from(proformas)
          .where(where)
          .orderBy(desc(proformas.createdAt), asc(proformas.id))
          .limit(BATCH_SIZE)
          .offset(offset);
      });
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  async findById(
    tenantId: string,
    id: string,
  ): Promise<ProformaRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(proformas)
        .where(eq(proformas.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      // The lines snapshotted at issue time. A proforma issued before line
      // items existed has none, and the template falls back to the single
      // line its header implies.
      const lines = await tx
        .select()
        .from(proformaLines)
        .where(eq(proformaLines.proformaId, id))
        .orderBy(asc(proformaLines.sequence));
      return { ...row, lines };
    });
  }

  /**
   * Same row as findById, plus the customer/project display names — the
   * technicalSpec/pricingBreakdown line data comes straight off this row's
   * own columns (a snapshot copied at issue time, see issue() below), NOT a
   * join back to the live quotation: that quotation can keep changing
   * status after conversion, so a join would render whatever the quotation
   * looks like today instead of what was actually issued. See
   * proforma-document.mapper.ts.
   */
  async findByIdForDocument(
    tenantId: string,
    id: string,
  ): Promise<ProformaDocumentRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const rows = await tx
        .select({
          ...getTableColumns(proformas),
          customerName: customers.name,
          projectName: projects.name,
        })
        .from(proformas)
        .leftJoin(
          customers,
          and(eq(proformas.tenantId, customers.tenantId), eq(proformas.customerId, customers.id)),
        )
        .leftJoin(
          projects,
          and(eq(proformas.tenantId, projects.tenantId), eq(proformas.projectId, projects.id)),
        )
        .where(eq(proformas.id, id))
        .limit(1);
      return rows[0] ?? null;
    });
  }

  /**
   * Issues a proforma from an APPROVED quotation, in ONE tenant transaction:
   * CAS the quotation APPROVED -> CONVERTED_TO_PROFORMA, reject if VAT has
   * rotated since the quotation was priced, claim the next gapless number
   * for (tenant, PROFORMA, fiscal year), insert the immutable money +
   * technicalSpec/pricingBreakdown snapshot. Any failure (CAS miss, stale
   * VAT, missing tenant, insert error) rolls back every write together.
   *
   * Deliberately reads/writes the `quotations` table directly (a shared
   * /database/schema table) instead of composing QuotationsRepository's own
   * (separately-transacted) updateStatus() — that would open a second
   * transaction and break the "all or none" guarantee the brief requires.
   * See task-2-report.md for the transaction-boundary reasoning.
   */
  async issue(
    tenantId: string,
    userId: string,
    quotationId: string,
    validUntil: string | null,
  ): Promise<ProformaRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const now = new Date();
      const today = todayIso(now);

      // 1. CAS the quotation APPROVED -> CONVERTED_TO_PROFORMA.
      const [quote] = await tx
        .update(quotations)
        .set({
          status: 'CONVERTED_TO_PROFORMA',
          statusChangedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(quotations.id, quotationId),
            eq(quotations.status, 'APPROVED'),
            isNull(quotations.deletedAt),
          ),
        )
        .returning();
      if (!quote) {
        const exists = await tx
          .select({ id: quotations.id })
          .from(quotations)
          .where(
            and(eq(quotations.id, quotationId), isNull(quotations.deletedAt)),
          )
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Quotation must be APPROVED to convert to a proforma — it may have already been converted, or changed concurrently',
          );
        }
        throw new NotFoundException('Quotation not found');
      }

      // 1b. VAT staleness guard: reject conversion if the open VAT version
      // has rotated since this quotation was priced (quote.rateVersionId
      // was resolved at quote-creation time — see QuotationsService.
      // createForProject — and never re-resolved). Mirrors RatesRepository.
      // findActive's query shape; read inside this same transaction so the
      // check is consistent with the CAS above.
      const [openVat] = await tx
        .select({ id: rateVersions.id })
        .from(rateVersions)
        .where(
          and(
            eq(rateVersions.kind, 'VAT'),
            lte(rateVersions.validFrom, today),
            or(isNull(rateVersions.validTo), gte(rateVersions.validTo, today)),
          ),
        )
        .orderBy(desc(rateVersions.validFrom))
        .limit(1);
      if (!openVat || openVat.id !== quote.rateVersionId) {
        throw new WorkflowTransitionError(
          'VAT rate has changed since this quotation was priced — re-quote before converting.',
        );
      }

      // 2. Fiscal year for today, from this tenant's configured boundary.
      const [tenant] = await tx
        .select({ fiscalYearStart: tenants.fiscalYearStart })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      const fiscalYear = computeFiscalYear(today, tenant.fiscalYearStart);

      // 3. Claim the next gapless number: a single upsert statement is
      // atomic under Postgres's row-level locking on its own — no advisory
      // lock needed (unlike RatesRepository.rotate()'s read-then-write race).
      const [claimed] = await tx
        .insert(documentSequences)
        .values({
          tenantId,
          kind: PROFORMA_SEQUENCE_KIND,
          fiscalYearLabel: fiscalYear.label,
          lastValue: 1,
        })
        .onConflictDoUpdate({
          target: [
            documentSequences.tenantId,
            documentSequences.kind,
            documentSequences.fiscalYearLabel,
          ],
          set: { lastValue: sql`${documentSequences.lastValue} + 1` },
        })
        .returning({ lastValue: documentSequences.lastValue });
      if (!claimed) {
        throw new Error('Failed to claim proforma number');
      }
      const proformaNumber = buildProformaNumber(
        fiscalYear.label,
        claimed.lastValue,
      );

      // 4. Insert the immutable snapshot. subtotalEtb is the TAXABLE BASE,
      // and it is derived by SUBTRACTION — total minus VAT — for the same
      // reason quote-pricing.ts's deriveFromGrandTotal subtracts rather than
      // recomputes: subtraction is the only rule that makes
      // `subtotalEtb + vatEtb === totalEtb` hold to the cent for every
      // quotation, and those three figures are what the customer reads.
      //
      // It is NOT the quotation's own `subtotalEtb` column (pre-margin on an
      // un-negotiated quote) and NOT `subtotalEtb + marginAmountEtb` (two
      // independently-rounded 2dp columns, which can land a cent either side
      // of the full-precision base VAT was computed on).
      //
      // It was `pricingBreakdown.subtotalWithMargin` until the negotiated
      // pricing landed, and that is now WRONG: QuotationsService.
      // priceFromGrandTotal rewrites the header's subtotal/tax/total from
      // the agreed round grand total but leaves `pricingBreakdown` holding
      // the CALCULATOR's original figures, so a negotiated quotation would
      // have issued a proforma whose taxable base was the pre-discount one
      // — 686,500 ETB adrift on the client's own document, with
      // subtotal + VAT no longer equal to total. Subtraction is right in
      // both cases: on an un-negotiated quote `totalPriceEtb - taxAmountEtb`
      // is exactly `money(subtotalWithMargin)` (createForProject adds an
      // already-2dp subtotal to the tax before rounding, so the rounding
      // commutes), and on a negotiated one it is exactly the `subtotalEtb`
      // deriveFromGrandTotal wrote. Both columns are NOT NULL numeric(14,2),
      // so the subtraction is exact and cannot fail to parse.
      const subtotalEtb = new Decimal(quote.totalPriceEtb)
        .minus(quote.taxAmountEtb)
        .toFixed(2);

      // The payment schedule as the offer stated it, read here and stored as
      // a jsonb snapshot on the proforma row (see proformas.paymentTerms for
      // why it is not a mirror table). `[]` when the quotation stated none —
      // distinct from the NULL a pre-terms proforma carries.
      const terms = await tx
        .select()
        .from(quotationPaymentTerms)
        .where(eq(quotationPaymentTerms.quotationId, quote.id))
        .orderBy(asc(quotationPaymentTerms.sequence));

      const [row] = await tx
        .insert(proformas)
        .values({
          tenantId,
          quotationId: quote.id,
          projectId: quote.projectId,
          customerId: quote.customerId,
          proformaNumber,
          fiscalYearLabel: fiscalYear.label,
          subtotalEtb,
          vatEtb: quote.taxAmountEtb,
          totalEtb: quote.totalPriceEtb,
          rateVersionId: quote.rateVersionId,
          technicalSpec: quote.technicalSpec,
          pricingBreakdown: quote.pricingBreakdown,
          // Commercial terms: copied, never joined. The discount columns
          // (calculatedTotalEtb / discountAmountEtb / discountPercent) are
          // deliberately NOT copied — `proformas` has no columns for them
          // and this document goes to the customer.
          referenceCode: quote.referenceCode,
          deliveryDays: quote.deliveryDays,
          warrantyPartsMonths: quote.warrantyPartsMonths,
          warrantyFreeServiceMonths: quote.warrantyFreeServiceMonths,
          validityDays: quote.validityDays,
          paymentTerms: terms.map(
            (term): ProformaPaymentTerm => ({
              sequence: term.sequence,
              label: term.label,
              percent: term.percent,
              triggerEvent: term.triggerEvent,
            }),
          ),
          issuedByUserId: userId,
          validUntil,
          status: 'ISSUED',
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert proforma');
      }

      // 4b. Copy every quotation line onto the proforma, in the same
      // transaction and in the same print order. Verbatim: spreading the
      // source row is what keeps the two shapes from drifting as columns are
      // added (the shared `lineColumns` builder in document-lines.ts exists
      // for the same reason). Only identity is re-minted — a new `id`, this
      // proforma's `proformaId`, fresh timestamps. A quotation written
      // before `quotation_lines` existed has none, and gets the line
      // `listLines` synthesizes from this row's own header snapshot instead.
      const sourceLines = await tx
        .select()
        .from(quotationLines)
        .where(eq(quotationLines.quotationId, quote.id))
        .orderBy(asc(quotationLines.sequence));
      if (sourceLines.length > 0) {
        await tx.insert(proformaLines).values(
          sourceLines.map(
            ({
              id: _id,
              quotationId: _quotationId,
              createdAt: _createdAt,
              updatedAt: _updatedAt,
              ...line
            }) => ({ ...line, tenantId, proformaId: row.id }),
          ),
        );
      }

      // 5. The project's stage follows the work: issuing the proforma IS the
      // PROFORMA event, so advance it here, in this same transaction, rather
      // than making someone re-declare it through
      // ProjectsService.updateStatus (whose hasIssuedProforma gate exists
      // precisely to look for the row inserted above). Silent no-op if the
      // project is already at or past PROFORMA or is CANCELLED; never throws,
      // so a stalled stage can't roll back an issued proforma.
      await autoAdvanceProject(tx, quote.projectId, 'PROFORMA');
      return row;
    });
  }

  /**
   * Compare-and-swap ISSUED -> CANCELLED, matching the CAS idiom used
   * throughout (QuotationsRepository.updateStatus, ProjectsRepository.
   * updateStatus). Append-only book: this does NOT touch the source
   * quotation or project — see ProformasService.cancel's doc comment for why
   * that's deliberate.
   */
  async cancel(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<ProformaRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(proformas)
        .set({ status: 'CANCELLED', cancelReason: reason, updatedAt: now })
        .where(and(eq(proformas.id, id), eq(proformas.status, 'ISSUED')))
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: proformas.id })
          .from(proformas)
          .where(eq(proformas.id, id))
          .limit(1);
        if (exists[0]) {
          throw new WorkflowTransitionError(
            'Proforma is not ISSUED — it may already be cancelled',
          );
        }
        throw new NotFoundException('Proforma not found');
      }
      return row;
    });
  }
}
