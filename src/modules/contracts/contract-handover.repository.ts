import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { WorkflowTransitionError } from '../../common/exceptions';
import { contracts, customers, proformas, projects } from '../../database/schema';
import { TenantDbService } from '../../database/tenant-db.service';
import { autoAdvanceProject } from '../projects/project-auto-advance';

export type ContractRecord = typeof contracts.$inferSelect;

/**
 * A contract joined with the display names and the equipment snapshot the
 * two certificates render. `technicalSpec` comes off the linked PROFORMA,
 * not the contract: the contract has no spec column of its own, and the
 * proforma's snapshot is the one the customer already holds a copy of.
 */
export interface ContractCertificateRow {
  contractNumber: string;
  status: string;
  projectName: string | null;
  customerName: string | null;
  scopeOfWork: string | null;
  warrantyMonths: number | null;
  signedAt: string | null;
  handedOverAt: string | null;
  handedOverToName: string | null;
  handoverNotes: string | null;
  technicalSpec: unknown;
}

/**
 * The handover half of the contracts module — added alongside the module's
 * own repository rather than into it, so the two certificates and the
 * handover transition land as new files instead of edits to a file being
 * written in parallel.
 */
@Injectable()
export class ContractHandoverRepository {
  constructor(private readonly tenantDb: TenantDbService) {}

  /**
   * Compare-and-swap SIGNED -> COMPLETED, recording the handover, and
   * advancing the project to COMPLETED in the SAME transaction — the same
   * shape ProformasRepository.issue uses for PROFORMA. A handover that
   * commits next to a project still sitting in EXECUTION is exactly the
   * drift autoAdvanceProject exists to prevent.
   *
   * The CAS on `status = 'SIGNED'` is what refuses a DRAFT, a CANCELLED, or
   * an already-COMPLETED contract: two people clicking Record handover at
   * once means the second matches no rows and gets the 409, not a second
   * silent overwrite of the first one's handover details.
   */
  async handover(
    tenantId: string,
    id: string,
    input: {
      handedOverAt: string;
      handedOverToName: string;
      handoverNotes: string | null;
    },
  ): Promise<ContractRecord> {
    const now = new Date();
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .update(contracts)
        .set({
          handedOverAt: input.handedOverAt,
          handedOverToName: input.handedOverToName,
          handoverNotes: input.handoverNotes,
          status: 'COMPLETED',
          updatedAt: now,
        })
        .where(and(eq(contracts.id, id), eq(contracts.status, 'SIGNED')))
        .returning();

      if (!row) {
        const [exists] = await tx
          .select({ status: contracts.status })
          .from(contracts)
          .where(eq(contracts.id, id))
          .limit(1);
        if (exists) {
          throw new WorkflowTransitionError(
            `Contract is ${exists.status}, not SIGNED — only a signed contract can be handed over`,
          );
        }
        throw new NotFoundException('Contract not found');
      }

      // Never throws and never rolls the handover back — the project's
      // stage is a consequence of the work, not a gate on it. Silent no-op
      // if the project is already COMPLETED or was CANCELLED.
      await autoAdvanceProject(tx, row.projectId, 'COMPLETED');
      return row;
    });
  }

  /** Row + display names + the linked proforma's spec, for the certificates. */
  async findByIdForCertificate(
    tenantId: string,
    id: string,
  ): Promise<ContractCertificateRow | null> {
    return this.tenantDb.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({
          contractNumber: contracts.contractNumber,
          status: contracts.status,
          projectName: projects.name,
          customerName: customers.name,
          scopeOfWork: contracts.scopeOfWork,
          warrantyMonths: contracts.warrantyMonths,
          signedAt: contracts.signedAt,
          handedOverAt: contracts.handedOverAt,
          handedOverToName: contracts.handedOverToName,
          handoverNotes: contracts.handoverNotes,
          technicalSpec: proformas.technicalSpec,
        })
        .from(contracts)
        .leftJoin(
          projects,
          and(
            eq(contracts.tenantId, projects.tenantId),
            eq(contracts.projectId, projects.id),
          ),
        )
        .leftJoin(
          customers,
          and(
            eq(contracts.tenantId, customers.tenantId),
            eq(contracts.customerId, customers.id),
          ),
        )
        .leftJoin(
          proformas,
          and(
            eq(contracts.tenantId, proformas.tenantId),
            eq(contracts.proformaId, proformas.id),
          ),
        )
        .where(eq(contracts.id, id))
        .limit(1);
      return row ?? null;
    });
  }
}
