import { Injectable, NotFoundException } from '@nestjs/common';

import type { ContractTemplateData } from '../../common/export/templates/contract.template';
import type { PaginatedResult } from '../../common/pagination';
import { todayIso } from '../../common/business-time';
import type { ContractStatus } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  ContractsRepository,
  type ContractListRow,
  type ContractRecord,
} from './contracts.repository';
import { ContractInstalmentsRepository } from './contract-instalments.repository';
import type { UpdateContractDto } from './dto/update-contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly contractsRepository: ContractsRepository,
    private readonly instalmentsRepository: ContractInstalmentsRepository,
  ) {}

  list(
    user: AuthenticatedUser,
    options: {
      projectId?: string;
      customerId?: string;
      status?: ContractStatus;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<ContractListRow>> {
    return this.contractsRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { projectId?: string; customerId?: string; status?: ContractStatus },
  ): AsyncGenerator<ContractListRow> {
    return this.contractsRepository.streamAll(user.tenantId, options);
  }

  async getById(user: AuthenticatedUser, id: string): Promise<ContractRecord> {
    const row = await this.contractsRepository.findById(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    return row;
  }

  issueFromProforma(
    user: AuthenticatedUser,
    proformaId: string,
  ): Promise<ContractRecord> {
    return this.contractsRepository.issueFromProforma(
      user.tenantId,
      user.userId,
      proformaId,
    );
  }

  /** DRAFT only — enforced by the repository's CAS, see updateDraft. */
  update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateContractDto,
  ): Promise<ContractRecord> {
    return this.contractsRepository.updateDraft(user.tenantId, id, dto);
  }

  /**
   * `signedAt` defaults to today in the BUSINESS timezone, not UTC —
   * between local midnight and 03:00 in Addis a UTC "today" is yesterday,
   * and this is the date printed on the agreement as the day it was signed.
   * Same reasoning as ContractHandoverService.handover.
   */
  sign(
    user: AuthenticatedUser,
    id: string,
    signedAt: string | undefined,
  ): Promise<ContractRecord> {
    return this.contractsRepository.sign(
      user.tenantId,
      id,
      signedAt ?? todayIso(),
    );
  }

  cancel(
    user: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<ContractRecord> {
    return this.contractsRepository.cancel(user.tenantId, id, reason);
  }

  /**
   * Row + party names, mapped to the shape buildContractHtml consumes.
   * Always allowed — the contract book is append-only, so a cancelled
   * contract still downloads exactly as it stood, same as a proforma.
   */
  async getDocumentData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ row: ContractListRow; data: ContractTemplateData }> {
    const row = await this.contractsRepository.findByIdWithNames(
      user.tenantId,
      id,
    );
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    const [customer, equipment, instalments] = await Promise.all([
      this.contractsRepository.findCustomerDetails(user.tenantId, row.customerId),
      this.contractsRepository.listEquipment(user.tenantId, row.proformaId),
      this.instalmentsRepository.listByContract(user.tenantId, id),
    ]);
    return {
      row,
      data: {
        contractNumber: row.contractNumber,
        status: row.status,
        issuedAt: row.createdAt,
        signedAt: row.signedAt,
        customerName: row.customerName ?? '',
        customer: {
          address:
            [customer?.addressLine1, customer?.addressLine2, customer?.city]
              .filter(Boolean)
              .join(', ') || null,
          phone: customer?.phone ?? null,
          tin: customer?.tinNumber ?? null,
        },
        projectName: row.projectName ?? '',
        contractValueEtb: row.contractValueEtb,
        equipment,
        // The payment-schedule document prints cancelled rows for the audit
        // trail; the agreement prints only what the parties are agreeing to.
        instalments: instalments
          .filter((i) => i.status !== 'CANCELLED')
          .map((i) => ({ label: i.label, amountEtb: i.amountEtb, dueDate: i.dueDate })),
        scopeOfWork: row.scopeOfWork,
        termsAndConditions: row.termsAndConditions,
        warrantyMonths: row.warrantyMonths,
        deliveryWorkingDays: row.deliveryWorkingDays,
        installationWorkingDays: row.installationWorkingDays,
        delayPenaltyPercentPerDay: row.delayPenaltyPercentPerDay,
        delayPenaltyCapPercent: row.delayPenaltyCapPercent,
        advanceGuaranteeRequired: row.advanceGuaranteeRequired,
        freeMaintenanceMonths: row.freeMaintenanceMonths,
        disputeForum: row.disputeForum,
      },
    };
  }
}
