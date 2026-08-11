import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  isUUID,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';
import { paymentMethodEnum, type PaymentMethod } from '../../../database/schema';
import { PaymentAllocationInputDto } from './payment-allocation-input.dto';

/** Rails that clear through a bank/telco, as opposed to CASH/OTHER — see BankAccountRequiredConstraint. */
const BANK_ACCOUNT_REQUIRED_METHODS = new Set<PaymentMethod>([
  'BANK_TRANSFER',
  'CHEQUE',
  'CBE_BIRR',
  'TELEBIRR',
]);

/**
 * Cross-field guard the brief spells out: bankAccountId is REQUIRED when
 * method is BANK_TRANSFER/CHEQUE/CBE_BIRR/TELEBIRR, and CASH/OTHER may omit
 * it. A plain `@IsOptional()` can't express "optional, but only for some
 * values of a sibling field" — `@IsOptional()` skips every other decorator
 * on the property the moment the value is undefined, which is exactly the
 * case this needs to keep validating. So format (`isUUID`) and
 * conditional-requiredness are both handled in one constraint that reads
 * `method` off the whole object being validated.
 */
@ValidatorConstraint({ name: 'bankAccountRequiredForMethod', async: false })
class BankAccountRequiredConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as CreatePaymentDto;
    if (value === undefined || value === null) {
      return !BANK_ACCOUNT_REQUIRED_METHODS.has(dto.method);
    }
    return typeof value === 'string' && isUUID(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const dto = args.object as CreatePaymentDto;
    return BANK_ACCOUNT_REQUIRED_METHODS.has(dto.method)
      ? 'bankAccountId is required (as a UUID) when method is BANK_TRANSFER, CHEQUE, CBE_BIRR or TELEBIRR'
      : 'bankAccountId must be a UUID when provided';
  }
}

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({ example: '112.00', description: 'ETB, up to 2 decimal places, > 0.' })
  @Matches(MONEY_RE, {
    message: 'amountEtb must be a positive decimal string with up to 2 decimals',
  })
  @Validate(PositiveMoneyConstraint)
  amountEtb!: string;

  @ApiProperty({ enum: paymentMethodEnum.enumValues })
  @IsEnum(paymentMethodEnum.enumValues)
  method!: PaymentMethod;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Defaults to now when omitted.',
  })
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @Validate(BankAccountRequiredConstraint)
  bankAccountId?: string;

  @ApiPropertyOptional({ example: 'CHQ-004821' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    type: [PaymentAllocationInputDto],
    description: 'Optional — unallocated (on-account/advance) payments are legal.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInputDto)
  allocations?: PaymentAllocationInputDto[];
}
