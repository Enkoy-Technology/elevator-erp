import { Injectable, NotFoundException } from '@nestjs/common';

import type { PaginatedResult } from '../../common/pagination';
import type { PaymentMethod } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { AllocatePaymentDto } from './dto/allocate-payment.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PaymentsRepository,
  type PaymentAllocationRecord,
  type PaymentListRow,
  type PaymentWithAllocations,
} from './payments.repository';
import type { PaymentDocumentRow } from './receipt-document.mapper';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

  list(
    user: AuthenticatedUser,
    options: {
      customerId?: string;
      method?: PaymentMethod;
      from?: string;
      to?: string;
      q?: string;
      page?: string;
      pageSize?: string;
    },
  ): Promise<PaginatedResult<PaymentListRow>> {
    return this.paymentsRepository.list(user.tenantId, options);
  }

  streamAll(
    user: AuthenticatedUser,
    options: { customerId?: string; method?: PaymentMethod; from?: string; to?: string; q?: string },
  ): AsyncGenerator<PaymentListRow> {
    return this.paymentsRepository.streamAll(user.tenantId, options);
  }

  record(user: AuthenticatedUser, dto: CreatePaymentDto): Promise<PaymentWithAllocations> {
    return this.paymentsRepository.record(user.tenantId, user.userId, {
      customerId: dto.customerId,
      amountEtb: dto.amountEtb,
      method: dto.method,
      receivedAt: dto.receivedAt,
      bankAccountId: dto.bankAccountId,
      reference: dto.reference,
      note: dto.note,
      allocations: dto.allocations,
    });
  }

  allocate(
    user: AuthenticatedUser,
    paymentId: string,
    dto: AllocatePaymentDto,
  ): Promise<PaymentAllocationRecord> {
    return this.paymentsRepository.allocate(
      user.tenantId,
      paymentId,
      dto.invoiceId,
      dto.amountEtb,
    );
  }

  reverse(
    user: AuthenticatedUser,
    paymentId: string,
    reason: string,
  ): Promise<PaymentWithAllocations> {
    return this.paymentsRepository.reverse(user.tenantId, paymentId, user.userId, reason);
  }

  async getDocumentData(user: AuthenticatedUser, id: string): Promise<PaymentDocumentRow> {
    const row = await this.paymentsRepository.findByIdForDocument(user.tenantId, id);
    if (!row) {
      throw new NotFoundException('Payment not found');
    }
    return row;
  }
}
