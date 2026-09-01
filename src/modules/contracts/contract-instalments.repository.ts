import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNotNull } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import {
  contractInstalments,
  contracts,
  customers,
  invoices,
  projects,
} from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { scheduleMismatchReason } from './instalment-schedule';

export type ContractInstalmentRecord = typeof contractInstalments.$inferSelect;

/** One row of a schedule as it arrives from the API, before sequencing. */
export interface InstalmentInput {
  label: string;
  dueDate?: string | null;
  amountEtb: string;
}

/** Everything the payment-schedule document renders, in one read. */
export interface PaymentScheduleRow {
  contractNumber: string;
  status: string;
  signedAt: string | null;
  createdAt: Date;
  contractValueEtb: string;
  customerName: string | null;
  projectName: string | null;
  instalments: ContractInstalmentRecord[];
}

@Injectable()
export class ContractInstalmentsRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  async listByContract(
    tenantId: string,
    contractId: string,
  ): Promise<ContractInstalmentRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      // Distinguish "contract has no schedule" from "no such contract" —
      // otherwise a typo'd id silently reads as an empty schedule.
      const [contract] = await tx
        .select({ id: contracts.id })
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      if (!contract) {
        throw new NotFoundException('Contract not found');
      }
      return tx
        .select()
        .from(contractInstalments)
        .where(eq(contractInstalments.contractId, contractId))
        .orderBy(asc(contractInstalments.sequence));
    });
  }

  /**
   * Replace the whole schedule, in one transaction.
   *
   * DRAFT only. Once a contract is SIGNED the customer holds a copy of the
   * schedule they signed, so the amounts stop being editable at all — not
   * "editable but audited". The recovery path for a genuinely renegotiated
   * schedule is the same append-only path the rest of this book uses:
   * cancel the contract and issue a new one. What stays possible after
   * signing is a status change (PENDING -> INVOICED), which is a record of
   * what happened, not a change to what was agreed.
   *
   * Delete-then-insert is safe precisely because of that DRAFT gate: an
   * instalment can only reach INVOICED on a SIGNED contract, so no row
   * deleted here can be carrying an invoice link.
   */
  async replaceSchedule(
    tenantId: string,
    contractId: string,
    lines: readonly InstalmentInput[],
  ): Promise<ContractInstalmentRecord[]> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [contract] = await tx
        .select({
          id: contracts.id,
          status: contracts.status,
          contractValueEtb: contracts.contractValueEtb,
        })
        .from(contracts)
        .where(eq(contracts.id, contractId))
        .limit(1);
      if (!contract) {
        throw new NotFoundException('Contract not found');
      }
      if (contract.status !== 'DRAFT') {
        throw new WorkflowTransitionError(
          `Contract is ${contract.status} — the agreed instalment amounts can no longer be changed. Cancel and re-issue the contract if the schedule was renegotiated.`,
        );
      }

      const mismatch = scheduleMismatchReason(lines, contract.contractValueEtb);
      if (mismatch) {
        throw new BadRequestException(mismatch);
      }

      await tx
        .delete(contractInstalments)
        .where(eq(contractInstalments.contractId, contractId));

      if (lines.length === 0) {
        return [];
      }

      return tx
        .insert(contractInstalments)
        .values(
          lines.map((line, index) => ({
            tenantId,
            contractId,
            sequence: index + 1,
            label: line.label,
            dueDate: line.dueDate ?? null,
            amountEtb: line.amountEtb,
          })),
        )
        .returning();
    });
  }

  /**
   * Record that the invoice for one instalment has actually been raised:
   * PENDING -> INVOICED, compare-and-swap, plus the checks that stop the
   * link from being nonsense.
   */
  async markInvoiced(
    tenantId: string,
    contractId: string,
    instalmentId: string,
    invoiceId: string,
  ): Promise<ContractInstalmentRecord> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          instalmentId: contractInstalments.id,
          instalmentStatus: contractInstalments.status,
          contractStatus: contracts.status,
          contractCustomerId: contracts.customerId,
        })
        .from(contractInstalments)
        .innerJoin(
          contracts,
          and(
            eq(contractInstalments.tenantId, contracts.tenantId),
            eq(contractInstalments.contractId, contracts.id),
          ),
        )
        .where(
          and(
            eq(contractInstalments.id, instalmentId),
            eq(contractInstalments.contractId, contractId),
          ),
        )
        .limit(1);
      if (!row) {
        throw new NotFoundException('Instalment not found on this contract');
      }
      if (row.contractStatus !== 'SIGNED' && row.contractStatus !== 'COMPLETED') {
        throw new WorkflowTransitionError(
          `Contract is ${row.contractStatus} — an instalment can only be invoiced against a signed agreement.`,
        );
      }

      // The FK already guarantees the invoice exists in this tenant, but it
      // does so as a Postgres error (a 500). Read it here for a clean 400,
      // and to check the one thing the FK cannot: that the invoice bills the
      // customer this contract was signed with.
      const [invoice] = await tx
        .select({ id: invoices.id, customerId: invoices.customerId })
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);
      if (!invoice) {
        throw new NotFoundException('Invoice not found');
      }
      if (invoice.customerId !== row.contractCustomerId) {
        throw new BadRequestException(
          'That invoice bills a different customer than this contract',
        );
      }

      // ponytail: read-then-write, no unique index on (tenant, invoice_id) —
      // two simultaneous requests naming the same invoice could each pass
      // this check. The schema is frozen for this slice; add a partial
      // unique index on contract_instalments(tenant_id, invoice_id) where
      // invoice_id is not null the next time migrations open, and this
      // check becomes the friendly error rather than the whole defence.
      const [alreadyLinked] = await tx
        .select({ id: contractInstalments.id })
        .from(contractInstalments)
        .where(
          and(
            eq(contractInstalments.invoiceId, invoiceId),
            isNotNull(contractInstalments.invoiceId),
          ),
        )
        .limit(1);
      if (alreadyLinked && alreadyLinked.id !== instalmentId) {
        throw new ConflictException(
          'That invoice is already recorded against another instalment',
        );
      }

      const [updated] = await tx
        .update(contractInstalments)
        .set({
          status: 'INVOICED',
          invoiceId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contractInstalments.id, instalmentId),
            eq(contractInstalments.status, 'PENDING'),
          ),
        )
        .returning();
      if (!updated) {
        throw new WorkflowTransitionError(
          `Instalment is ${row.instalmentStatus}, not PENDING — it may already have been invoiced`,
        );
      }
      return updated;
    });
  }

  /** Contract header + party names + the ordered instalments, for the document. */
  async findScheduleForDocument(
    tenantId: string,
    contractId: string,
  ): Promise<PaymentScheduleRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [contract] = await tx
        .select({
          contractNumber: contracts.contractNumber,
          status: contracts.status,
          signedAt: contracts.signedAt,
          createdAt: contracts.createdAt,
          contractValueEtb: contracts.contractValueEtb,
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
        )
        .where(eq(contracts.id, contractId))
        .limit(1);
      if (!contract) {
        return null;
      }
      const instalments = await tx
        .select()
        .from(contractInstalments)
        .where(eq(contractInstalments.contractId, contractId))
        .orderBy(asc(contractInstalments.sequence));
      return { ...contract, instalments };
    });
  }
}
