import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

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
}
