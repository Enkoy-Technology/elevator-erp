import { Injectable, NotFoundException } from '@nestjs/common';

import type { AuthenticatedUser } from '../../types/auth.types';
import type { AllocatePaymentDto } from './dto/allocate-payment.dto';
import type { CreatePaymentDto } from './dto/create-payment.dto';
import {
  PaymentsRepository,
  type PaymentAllocationRecord,
  type PaymentWithAllocations,
} from './payments.repository';
import type { PaymentDocumentRow } from './receipt-document.mapper';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

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
