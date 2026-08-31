import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Decimal } from 'decimal.js';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  isUUID,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { NotFarFutureConstraint } from '../../../common/dto/date';
import { MONEY_RE } from '../../../common/dto/money';
import {
  expenseCategoryEnum,
  paymentMethodEnum,
  supplyKindEnum,
  type ExpenseCategory,
  type PaymentMethod,
  type SupplyKind,
} from '../../../database/schema';

// Same shape as CreateRateVersionDto's own DATE_ONLY_RE + IsDateString({strict:true})
// combo — a regex alone accepts '2026-02-30', so the format check is paired
// with a real calendar round-trip check.
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const isPositiveMoney = (value: unknown): boolean =>
  typeof value === 'string' && MONEY_RE.test(value) && new Decimal(value).gt(0);

/** Rails that clear through a bank/telco, as opposed to CASH/OTHER. */
const BANK_ACCOUNT_REQUIRED_METHODS = new Set<PaymentMethod>([
  'BANK_TRANSFER',
  'CHEQUE',
  'CBE_BIRR',
  'TELEBIRR',
]);

/**
 * Same rule as CreatePaymentDto.bankAccountId (payments/dto/create-payment.dto.ts)
 * — bankAccountId is required when paidVia clears through a bank/telco rail,
 * optional for CASH/OTHER. Duplicated rather than shared: this is only the
 * 2nd occurrence codebase-wide — see PaymentsRepository.isUniqueViolation's
 * doc comment for the "reuse verbatim only at the 3rd+ occurrence" rule this
 * follows.
 */
@ValidatorConstraint({ name: 'bankAccountRequiredForPaidVia', async: false })
class BankAccountRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateExpenseDto;
    if (value === undefined || value === null) {
      return !BANK_ACCOUNT_REQUIRED_METHODS.has(dto.paidVia);
    }
    return typeof value === 'string' && isUUID(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateExpenseDto;
    return BANK_ACCOUNT_REQUIRED_METHODS.has(dto.paidVia)
      ? 'bankAccountId is required (as a UUID) when paidVia is BANK_TRANSFER, CHEQUE, CBE_BIRR or TELEBIRR'
      : 'bankAccountId must be a UUID when provided';
  }
}

/**
 * Exactly one of {netAmountEtb, vatIncluded:false} or {grossAmountEtb,
 * vatIncluded:true} — brief 4.1. `vatIncluded` is mandatory (@IsBoolean(),
 * no @IsOptional), so these two constraints together reject both-provided
 * AND neither-provided: each field is required precisely when vatIncluded
 * matches its own direction, and forbidden (must be undefined) otherwise.
 */
@ValidatorConstraint({ name: 'netAmountRequiredWhenVatExclusive', async: false })
class NetAmountRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateExpenseDto;
    return dto.vatIncluded === false ? isPositiveMoney(value) : value === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateExpenseDto;
    return dto.vatIncluded === false
      ? 'netAmountEtb is required (positive money, up to 2 decimals) when vatIncluded is false'
      : 'netAmountEtb must be omitted when vatIncluded is true — provide grossAmountEtb instead';
  }
}

@ValidatorConstraint({ name: 'grossAmountRequiredWhenVatInclusive', async: false })
class GrossAmountRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreateExpenseDto;
    return dto.vatIncluded === true ? isPositiveMoney(value) : value === undefined;
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreateExpenseDto;
    return dto.vatIncluded === true
      ? 'grossAmountEtb is required (positive money, up to 2 decimals) when vatIncluded is true'
      : 'grossAmountEtb must be omitted when vatIncluded is false — provide netAmountEtb instead';
  }
}

export class CreateExpenseDto {
  @ApiProperty({ maxLength: 200 })
  @IsString()
  @MaxLength(200)
  supplierName!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierTin?: string;

  @ApiProperty({
    description:
      'Whether the supplier has a trade licence on file — missing TIN OR this false forces WHT_NO_TIN (30%).',
  })
  @IsBoolean()
  supplierLicenceOnFile!: boolean;

  @ApiProperty({ enum: supplyKindEnum.enumValues })
  @IsEnum(supplyKindEnum.enumValues)
  supplyKind!: SupplyKind;

  @ApiProperty({ enum: expenseCategoryEnum.enumValues })
  @IsEnum(expenseCategoryEnum.enumValues)
  category!: ExpenseCategory;

  @ApiProperty({
    example: '2026-08-08',
    description:
      'ISO date the expense was incurred. VAT and WHT are resolved AT THIS DATE, not today.',
  })
  @Matches(DATE_ONLY_RE)
  @IsDateString({ strict: true })
  // Fix-wave-c #2: same R3 gap CreatePaymentDto.receivedAt/WithholdingDto.recordedAt
  // already closed — a year typo here doesn't just hide the expense from
  // date-windowed views, it drives rate resolution (VAT/WHT resolved AT
  // THIS DATE, per the description above). NotFarFutureConstraint already
  // tolerates date-only strings (see its own doc comment).
  @Validate(NotFarFutureConstraint)
  expenseDate!: string;

  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  @IsEnum(paymentMethodEnum.enumValues)
  paidVia!: PaymentMethod;

  @ApiPropertyOptional({ format: 'uuid' })
  @Validate(BankAccountRequiredConstraint)
  bankAccountId?: string;

  @ApiProperty({
    description:
      'true: grossAmountEtb is the VAT-inclusive bill total, net is derived. false: netAmountEtb is given, VAT/gross are derived.',
  })
  @IsBoolean()
  vatIncluded!: boolean;

  @ApiPropertyOptional({ example: '100.00', description: 'Required iff vatIncluded is false.' })
  @Validate(NetAmountRequiredConstraint)
  netAmountEtb?: string;

  @ApiPropertyOptional({ example: '115.00', description: 'Required iff vatIncluded is true.' })
  @Validate(GrossAmountRequiredConstraint)
  grossAmountEtb?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 'INV-4821', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
