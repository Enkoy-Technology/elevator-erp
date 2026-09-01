import { Injectable, NotFoundException } from '@nestjs/common';

import { todayIso } from '../../common/business-time';
import { WorkflowTransitionError } from '../../common/exceptions';
import type { CompletionCertificateTemplateData } from '../../common/export/templates/completion-certificate.template';
import {
  warrantyWindow,
  type WarrantyCertificateTemplateData,
} from '../../common/export/templates/warranty-certificate.template';
import type { AuthenticatedUser } from '../../types/auth.types';
import {
  ContractHandoverRepository,
  type ContractRecord,
} from './contract-handover.repository';
import type { HandoverContractDto } from './dto/handover-contract.dto';

@Injectable()
export class ContractHandoverService {
  constructor(private readonly repository: ContractHandoverRepository) {}

  /**
   * Record the handover and close the contract. `handedOverAt` defaults to
   * today in the BUSINESS timezone, not UTC — between local midnight and
   * 03:00 in Addis a UTC "today" is yesterday, and this date is the one the
   * warranty clock starts on.
   */
  handover(
    user: AuthenticatedUser,
    id: string,
    dto: HandoverContractDto,
  ): Promise<ContractRecord> {
    return this.repository.handover(user.tenantId, id, {
      handedOverAt: dto.handedOverAt ?? todayIso(),
      handedOverToName: dto.handedOverToName,
      handoverNotes: dto.handoverNotes ?? null,
    });
  }

  async completionCertificateData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ contractNumber: string; data: CompletionCertificateTemplateData }> {
    const row = await this.load(user, id);
    // Not a nullability quibble: this certificate's whole content is the
    // handover, so it cannot be issued before one is recorded.
    if (!row.handedOverAt || !row.handedOverToName) {
      throw new WorkflowTransitionError(
        'No handover has been recorded for this contract — record the handover before issuing a completion certificate',
      );
    }
    return {
      contractNumber: row.contractNumber,
      data: {
        contractNumber: row.contractNumber,
        projectName: row.projectName ?? '',
        customerName: row.customerName ?? '',
        scopeOfWork: row.scopeOfWork,
        handedOverAt: row.handedOverAt,
        handedOverToName: row.handedOverToName,
        handoverNotes: row.handoverNotes,
      },
    };
  }

  async warrantyCertificateData(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ contractNumber: string; data: WarrantyCertificateTemplateData }> {
    const row = await this.load(user, id);
    const warranty = warrantyWindow(row);
    // Refuse rather than print a blank period: a certificate whose cover
    // has no end date is worse than no certificate at all.
    if (!warranty || row.warrantyMonths == null) {
      throw new WorkflowTransitionError(
        row.warrantyMonths == null
          ? 'This contract carries no warranty period — set warrantyMonths before issuing a warranty certificate'
          : 'This contract has neither a handover nor a signing date, so the warranty period cannot be computed',
      );
    }
    return {
      contractNumber: row.contractNumber,
      data: {
        contractNumber: row.contractNumber,
        customerName: row.customerName ?? '',
        projectName: row.projectName ?? '',
        technicalSpec: row.technicalSpec as Record<string, unknown> | null,
        warrantyMonths: row.warrantyMonths,
        warranty,
      },
    };
  }

  private async load(user: AuthenticatedUser, id: string) {
    const row = await this.repository.findByIdForCertificate(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    return row;
  }
}
