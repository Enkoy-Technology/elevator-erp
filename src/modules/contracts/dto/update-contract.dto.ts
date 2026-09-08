import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** 0–100 with up to three decimals ("0.02"); fits numeric(6,3). */
const PERCENT_3DP_RE = /^(100(\.0{1,3})?|\d{1,2}(\.\d{1,3})?)$/;
/** 0–100 with up to two decimals ("5"); fits numeric(5,2). */
const PERCENT_2DP_RE = /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/;

/**
 * The negotiable text of a DRAFT contract. Every field is optional AND
 * nullable: `null` clears the field, `undefined` (absent) leaves it alone —
 * so `@ValidateIf(v !== null)` rather than plain `@IsOptional()`, which
 * would also skip validation for a genuine value.
 *
 * Nothing here can change the money or the parties: those were copied off
 * the proforma at issue time and are what makes this a snapshot rather than
 * a live view. A wrong customer or a wrong value is a cancel-and-re-issue,
 * not an edit.
 */
export class UpdateContractDto {
  @ApiPropertyOptional({
    example: 'Supply and installation of two 8-person passenger elevators.',
    maxLength: 10000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(10000)
  scopeOfWork?: string | null;

  @ApiPropertyOptional({
    example: '40% advance on signing. Retention of 10% for twelve months.',
    maxLength: 20000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(20000)
  termsAndConditions?: string | null;

  @ApiPropertyOptional({
    example: 12,
    description:
      'Warranty length in months from handover. Null for an agreement that carries none.',
    minimum: 0,
    maximum: 600,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  // 600 months is fifty years — past anything real, and the bound is what
  // stops a typo'd 12000 printing on the customer's warranty certificate.
  @IsInt()
  @Min(0)
  @Max(600)
  warrantyMonths?: number | null;

  // The clauses the paper contract states as figures. Same null/undefined
  // convention as above: null clears, absent leaves alone.

  @ApiPropertyOptional({ example: 90, description: 'Article 3.2: delivery within N working days of the effective date.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1000)
  deliveryWorkingDays?: number | null;

  @ApiPropertyOptional({ example: 15, description: 'Article 3.3: installation within N working days of site readiness.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(1000)
  installationWorkingDays?: number | null;

  @ApiPropertyOptional({ example: '0.02', description: 'Article 7.1: percent of the contract price per day of delay.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(PERCENT_3DP_RE, { message: 'delayPenaltyPercentPerDay must be 0–100 with up to 3 decimals' })
  delayPenaltyPercentPerDay?: string | null;

  @ApiPropertyOptional({ example: '5', description: 'Article 7.1: penalty ceiling as a percent of the contract price.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(PERCENT_2DP_RE, { message: 'delayPenaltyCapPercent must be 0–100 with up to 2 decimals' })
  delayPenaltyCapPercent?: string | null;

  @ApiPropertyOptional({ example: true, description: 'Article 5.1: the advance is released only against a guarantee cheque of equal value.' })
  // NOT NULL column: null must fail validation, not reach Postgres.
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  advanceGuaranteeRequired?: boolean;

  @ApiPropertyOptional({ example: 12, description: 'Article 6.2: months of free maintenance after handover.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  @Max(600)
  freeMaintenanceMonths?: number | null;

  @ApiPropertyOptional({ example: 'the Addis Ababa Chamber of Commerce and Sectoral Associations', description: 'Article 8.2: where an unsettled dispute is referred.', nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  disputeForum?: string | null;
}
