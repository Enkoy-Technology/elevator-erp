import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { SIGNED_MONEY_RE } from '../../../common/dto/money';
import { bankTxKindEnum, type BankTxKind } from '../../../database/schema';

// Same shape as CreateExpenseDto's own DATE_ONLY_RE + IsDateString({strict:true})
// combo — a regex alone accepts '2026-02-30', so the format check is paired
// with a real calendar round-trip check.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBankTransactionDto {
  @ApiProperty({ example: '2026-08-08' })
  @Matches(DATE_ONLY_RE)
  @IsDateString({ strict: true })
  txDate!: string;

  @ApiProperty({
    example: '-1500.00',
    description:
      'Signed ETB, up to 2 decimal places — positive = money in, negative = money out (banks.ts).',
  })
  @Matches(SIGNED_MONEY_RE, {
    message: 'amountEtb must be a signed decimal string with up to 2 decimals',
  })
  amountEtb!: string;

  @ApiProperty({ enum: bankTxKindEnum.enumValues })
  @IsEnum(bankTxKindEnum.enumValues)
  kind!: BankTxKind;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Links this line to an existing payment in this tenant — a payment may be linked to at most one bank transaction (409 on a second attempt).',
  })
  @IsOptional()
  @IsUUID()
  paymentId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Links this line to an existing expense in this tenant — an expense may be linked to at most one bank transaction (409 on a second attempt).',
  })
  @IsOptional()
  @IsUUID()
  expenseId?: string;
}
