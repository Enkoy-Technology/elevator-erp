import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, Matches, Validate } from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

/**
 * One `{ invoiceId, amountEtb }` allocation line — shared shape between
 * `CreatePaymentDto.allocations[]` (record-with-allocations, 3.1) and
 * `AllocatePaymentDto` (allocate-later, 3.2): the brief specifies 3.2 as
 * "same guards as 3.1 step 3", so the input shape matches too. All the
 * over-allocation/customer-match/VOID guards live in
 * PaymentsRepository.guardAndInsertAllocation, not here — this DTO only
 * owns format validation.
 */
export class PaymentAllocationInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  invoiceId!: string;

  @ApiProperty({ example: '112.00', description: 'ETB, up to 2 decimal places, > 0.' })
  @Matches(MONEY_RE, {
    message: 'amountEtb must be a positive decimal string with up to 2 decimals',
  })
  @Validate(PositiveMoneyConstraint)
  amountEtb!: string;
}
