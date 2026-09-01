import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
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
import type { TenantTransaction } from '../../database/database.types';
import {
  contracts,
  customers,
  documentSequences,
  proformas,
  projects,
  tenants,
  type ContractStatus,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { autoAdvanceProject } from '../projects/project-auto-advance';
import { buildContractNumber } from './contract-number';

export type ContractRecord = typeof contracts.$inferSelect;

/** A contract plus the party display names the list and document need. */
export type ContractListRow = ContractRecord & {
  customerName: string | null;
  projectName: string | null;
};

/** `document_sequences.kind` for this document type — see the table's own doc comment. */
const CONTRACT_SEQUENCE_KIND = 'CONTRACT';

/**
 * A COMPLETED contract is deliberately absent: the works were handed over,
 * and un-completing that would erase the event the completion and warranty
 * certificates were issued against.
 */
const CANCELLABLE: readonly ContractStatus[] = ['DRAFT', 'SIGNED'];

/** The filters `list`, `streamAll` and the export all honor, in one place. */
interface ContractFilters {
  projectId?: string;
  status?: ContractStatus;
}

@Injectable()
export class ContractsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async list(
    tenantId: string,
    options: ContractFilters & { page?: string; pageSize?: string },
  ): Promise<PaginatedResult<ContractListRow>> {
    const { page, pageSize, offset } = normalizePageQuery(
      options.page,
      options.pageSize,
    );
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const where = whereFor(options);
      const [totalRow] = await tx
        .select({ value: count() })
        .from(contracts)
        .where(where);
      const items = await this.selectWithNames(tx)
        .where(where)
        .orderBy(desc(contracts.createdAt), asc(contracts.id))
        .limit(pageSize)
        .offset(offset);
      return toPaginatedResult(items, Number(totalRow?.value ?? 0), page, pageSize);
    });
  }

  /**
   * Streams every contract matching the same filters `list()` honors, for
   * bulk export, in batches of BATCH_SIZE.
   *
   * ponytail: offset batching with the same `id` tiebreaker
   * ProformasRepository.streamAll uses, so equal `createdAt` values don't
   * duplicate or skip rows across batch boundaries — concurrent inserts can
   * still shift the window. Switch to a keyset cursor if a large-tenant
   * export ever times out.
   */
  async *streamAll(
    tenantId: string,
    options: ContractFilters,
  ): AsyncGenerator<ContractListRow> {
    const BATCH_SIZE = 500;
    let offset = 0;
    for (;;) {
      const batch = await this.tenantDb.withTenant(tenantId, (tx) =>
        this.selectWithNames(tx)
          .where(whereFor(options))
          .orderBy(desc(contracts.createdAt), asc(contracts.id))
          .limit(BATCH_SIZE)
          .offset(offset),
      );
      for (const row of batch) {
        yield row;
      }
      if (batch.length < BATCH_SIZE) {
        return;
      }
      offset += BATCH_SIZE;
    }
  }

  async findById(tenantId: string, id: string): Promise<ContractRecord | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, id))
        .limit(1);
      return row ?? null;
    });
  }

  /** Same row plus the party names, for the contract document. */
  async findByIdWithNames(
    tenantId: string,
    id: string,
  ): Promise<ContractListRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await this.selectWithNames(tx)
        .where(eq(contracts.id, id))
        .limit(1);
      return row ?? null;
    });
  }

  /**
   * Issues a DRAFT contract from an ISSUED proforma, in ONE tenant
   * transaction: claim the next gapless number for (tenant, CONTRACT,
   * fiscal year) and insert the denormalised snapshot. Same shape as
   * ProformasRepository.issue, minus the CAS — a proforma is NOT consumed
   * by being contracted (it stays ISSUED and downloadable), so there is no
   * source status to swap.
   *
   * One contract per proforma. The unique constraint
   * `contracts_tenant_id_proforma_id_uk` is the real guarantee; the read
   * below only turns the resulting Postgres error into a clean 409 for the
   * common non-racing case.
   *
   * projectId/customerId/contractValueEtb are COPIED off the proforma, not
   * joined: the proforma's own money is itself a snapshot of the quotation
   * at issue time, and a contract must keep printing the value that was
   * agreed even if anything upstream is later re-issued.
   */
  async issueFromProforma(
    tenantId: string,
    userId: string,
    proformaId: string,
  ): Promise<ContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const today = todayIso();

      const [proforma] = await tx
        .select({
          id: proformas.id,
          status: proformas.status,
          projectId: proformas.projectId,
          customerId: proformas.customerId,
          totalEtb: proformas.totalEtb,
        })
        .from(proformas)
        .where(eq(proformas.id, proformaId))
        .limit(1);
      if (!proforma) {
        throw new NotFoundException('Proforma not found');
      }
      if (proforma.status !== 'ISSUED') {
        throw new WorkflowTransitionError(
          `Proforma is ${proforma.status} — only an ISSUED proforma can be turned into a contract`,
        );
      }

      const [existing] = await tx
        .select({ contractNumber: contracts.contractNumber })
        .from(contracts)
        .where(eq(contracts.proformaId, proformaId))
        .limit(1);
      if (existing) {
        throw new WorkflowTransitionError(
          `This proforma already has contract ${existing.contractNumber} — cancel it before issuing another`,
        );
      }

      const [tenant] = await tx
        .select({ fiscalYearStart: tenants.fiscalYearStart })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      const fiscalYear = computeFiscalYear(today, tenant.fiscalYearStart);

      // A single upsert is atomic under Postgres's row-level locking on its
      // own — no advisory lock needed. Same claim as
      // ProformasRepository.issue.
      const [claimed] = await tx
        .insert(documentSequences)
        .values({
          tenantId,
          kind: CONTRACT_SEQUENCE_KIND,
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
        throw new Error('Failed to claim contract number');
      }

      const [row] = await tx
        .insert(contracts)
        .values({
          tenantId,
          proformaId: proforma.id,
          projectId: proforma.projectId,
          customerId: proforma.customerId,
          contractNumber: buildContractNumber(fiscalYear.label, claimed.lastValue),
          fiscalYearLabel: fiscalYear.label,
          contractValueEtb: proforma.totalEtb,
          issuedByUserId: userId,
          status: 'DRAFT',
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert contract');
      }
      // Deliberately NOT advanced here: a draft nobody has signed is not a
      // CONTRACT-stage project. sign() below is the event.
      return row;
    });
  }

  /**
   * Edit the negotiable text of a DRAFT. Undefined fields are left alone —
   * `null` is a real value (clear the field), so a plain `?? existing`
   * would make clearing impossible.
   *
   * DRAFT only, enforced by the CAS: once SIGNED the customer holds a copy
   * of the page they signed, so its wording stops being editable at all.
   * The recovery path for a renegotiated agreement is cancel and re-issue,
   * the same append-only path the rest of this book uses.
   */
  async updateDraft(
    tenantId: string,
    id: string,
    patch: {
      scopeOfWork?: string | null;
      termsAndConditions?: string | null;
      warrantyMonths?: number | null;
    },
  ): Promise<ContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(contracts)
        .set({
          ...(patch.scopeOfWork !== undefined
            ? { scopeOfWork: patch.scopeOfWork }
            : {}),
          ...(patch.termsAndConditions !== undefined
            ? { termsAndConditions: patch.termsAndConditions }
            : {}),
          ...(patch.warrantyMonths !== undefined
            ? { warrantyMonths: patch.warrantyMonths }
            : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(contracts.id, id), eq(contracts.status, 'DRAFT')))
        .returning();
      if (!row) {
        throw await this.explainMiss(tx, id, 'DRAFT', 'edited');
      }
      return row;
    });
  }

  /**
   * Compare-and-swap DRAFT -> SIGNED, and advance the project to CONTRACT
   * in the SAME transaction — the shape ProformasRepository.issue uses for
   * PROFORMA. Signing IS the CONTRACT event; a signed agreement sitting
   * next to a project still at PROFORMA is exactly the drift
   * autoAdvanceProject exists to prevent.
   *
   * The CAS is what refuses a SIGNED, COMPLETED or CANCELLED contract, and
   * what makes two people clicking Sign at once produce one signature and
   * one 409 rather than a silently rewritten signing date.
   */
  async sign(
    tenantId: string,
    id: string,
    signedAt: string,
  ): Promise<ContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(contracts)
        .set({ status: 'SIGNED', signedAt, updatedAt: new Date() })
        .where(and(eq(contracts.id, id), eq(contracts.status, 'DRAFT')))
        .returning();
      if (!row) {
        throw await this.explainMiss(tx, id, 'DRAFT', 'signed');
      }
      // Never throws and never rolls the signature back — the project's
      // stage is a consequence of the work, not a gate on it.
      await autoAdvanceProject(tx, row.projectId, 'CONTRACT');
      return row;
    });
  }

  /**
   * Cancel with a reason. A DRAFT or a SIGNED contract can be cancelled; a
   * COMPLETED one cannot — the works were handed over, and un-completing
   * that would erase the event the completion and warranty certificates
   * were issued against.
   *
   * Append-only book: this does NOT revert the source proforma or wind the
   * project back down the pipeline. Re-issuing is the recovery path.
   */
  async cancel(
    tenantId: string,
    id: string,
    reason: string,
  ): Promise<ContractRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(contracts)
        .set({ status: 'CANCELLED', cancelReason: reason, updatedAt: new Date() })
        .where(
          and(eq(contracts.id, id), inArray(contracts.status, CANCELLABLE)),
        )
        .returning();
      if (!row) {
        const [exists] = await tx
          .select({ status: contracts.status })
          .from(contracts)
          .where(eq(contracts.id, id))
          .limit(1);
        if (exists) {
          throw new WorkflowTransitionError(
            `Contract is ${exists.status} — only a DRAFT or SIGNED contract can be cancelled`,
          );
        }
        throw new NotFoundException('Contract not found');
      }
      return row;
    });
  }

  /** The contract columns plus the two party names, as one joined select. */
  private selectWithNames(tx: TenantTransaction) {
    return tx
      .select({
        ...getTableColumns(contracts),
        customerName: customers.name,
        projectName: projects.name,
      })
      .from(contracts)
      .leftJoin(
        customers,
        and(
          eq(contracts.tenantId, customers.tenantId),
          eq(contracts.customerId, customers.id),
        ),
      )
      .leftJoin(
        projects,
        and(
          eq(contracts.tenantId, projects.tenantId),
          eq(contracts.projectId, projects.id),
        ),
      );
  }

  /**
   * Why a CAS matched no rows: the wrong status (409, naming the status the
   * caller actually has) or no such contract (404). Shared by every
   * transition here so the message is written once.
   */
  private async explainMiss(
    tx: TenantTransaction,
    id: string,
    required: ContractStatus,
    verb: string,
  ): Promise<Error> {
    const [exists] = await tx
      .select({ status: contracts.status })
      .from(contracts)
      .where(eq(contracts.id, id))
      .limit(1);
    if (exists) {
      return new WorkflowTransitionError(
        `Contract is ${exists.status}, not ${required} — only a ${required} contract can be ${verb}`,
      );
    }
    return new NotFoundException('Contract not found');
  }
}

const whereFor = (options: ContractFilters) => {
  const filters = [];
  if (options.projectId) {
    filters.push(eq(contracts.projectId, options.projectId));
  }
  if (options.status) {
    filters.push(eq(contracts.status, options.status));
  }
  return filters.length > 0 ? and(...filters) : undefined;
};
