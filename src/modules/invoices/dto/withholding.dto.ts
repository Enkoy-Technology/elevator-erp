import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, Matches, MaxLength, Validate } from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

/**
 * Records the withholding credit a customer retained when settling this
 * invoice (see the Ethiopian domestic-withholding background in the task
 * brief). `voucherRef` is optional but strongly encouraged — the supplier
 * legally receives a withholding voucher from the customer, and this field
 * mirrors its reference the same way the invoice's fiscal* columns mirror
 * the ETR receipt. Re-posting this endpoint corrects the value (absolute
 * set) rather than accumulating — see InvoicesRepository.recordWithholding's
 * doc comment for why that is safe here.
 */
export class WithholdingDto {
  @ApiProperty({ example: '3.00', description: 'ETB, up to 2 decimal places, > 0.' })
  @Matches(MONEY_RE, {
    message: 'amountEtb must be a positive decimal string with up to 2 decimals',
  })
  @Validate(PositiveMoneyConstraint)
  amountEtb!: string;

  @ApiPropertyOptional({ example: 'WHT-2026-000123' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  voucherRef?: string;

  @ApiPropertyOptional({ format: 'date-time', example: '2026-09-30T14:05:00Z' })
  @IsOptional()
  @IsISO8601()
  recordedAt?: string;
}
