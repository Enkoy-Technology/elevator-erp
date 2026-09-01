import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import {
  ContractInstalmentsRepository,
  type ContractInstalmentRecord,
  type InstalmentInput,
  type PaymentScheduleRow,
} from './contract-instalments.repository';

@Injectable()
export class ContractInstalmentsService {
  constructor(private readonly instalmentsRepository: ContractInstalmentsRepository) {}

  list(
    user: AuthenticatedUser,
    contractId: string,
  ): Promise<ContractInstalmentRecord[]> {
    return this.instalmentsRepository.listByContract(user.tenantId, contractId);
  }

  replaceSchedule(
    user: AuthenticatedUser,
    contractId: string,
    lines: readonly InstalmentInput[],
  ): Promise<ContractInstalmentRecord[]> {
    return this.instalmentsRepository.replaceSchedule(
      user.tenantId,
      contractId,
      lines,
    );
  }

  markInvoiced(
    user: AuthenticatedUser,
    contractId: string,
    instalmentId: string,
    invoiceId: string,
  ): Promise<ContractInstalmentRecord> {
    return this.instalmentsRepository.markInvoiced(
      user.tenantId,
      contractId,
      instalmentId,
      invoiceId,
    );
  }

  async getScheduleForDocument(
    user: AuthenticatedUser,
    contractId: string,
  ): Promise<PaymentScheduleRow> {
    const row = await this.instalmentsRepository.findScheduleForDocument(
      user.tenantId,
      contractId,
    );
    if (!row) {
      throw new NotFoundException('Contract not found');
    }
    return row;
  }
}
