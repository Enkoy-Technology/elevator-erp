import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, Validate } from 'class-validator';

import { NotFarFutureConstraint } from '../../../common/dto/date';
import { MONEY_RE } from '../../../common/dto/money';

/**
 * Records the withholding credit a customer retained when settling this
 * invoice (see the Ethiopian domestic-withholding background in the task
 * brief). `voucherRef` is optional but strongly encouraged — the supplier
 * legally receives a withholding voucher from the customer, and this field
 * mirrors its reference the same way the invoice's fiscal* columns mirror
 * the ETR receipt. Re-posting this endpoint corrects the value (absolute
 * set) rather than accumulating — see InvoicesRepository.recordWithholding's
 * doc comment for why that is safe here.
 *
 * `amountEtb` deliberately allows `'0.00'` — unlike every other money DTO
 * field that requires `@Validate(PositiveMoneyConstraint)`. A mis-keyed
 * withholding voucher (wrong invoice, wrong amount) has to be correctable,
 * and the absolute-set semantics above mean the ONLY way to correct it away
 * entirely is to re-post a zero. Rejecting '0.00' here made a bad voucher
 * permanent AND made the invoice permanently unvoidable (voidInvoice refuses
 * any invoice with a non-zero withholding credit) — see
 * InvoicesRepository.recordWithholding's own handling of a zero-set.
 */
export class WithholdingDto {
  @ApiProperty({ example: '3.00', description: 'ETB, up to 2 decimal places, >= 0.' })
  @Matches(MONEY_RE, {
    message: 'amountEtb must be a non-negative decimal string with up to 2 decimals',
  })
  amountEtb!: string;

  @ApiPropertyOptional({ example: 'WHT-2026-000123' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voucherRef?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T14:05:00Z' })
  @IsOptional()
  @IsISO8601()
  @Validate(NotFarFutureConstraint)
  recordedAt?: string;
}
