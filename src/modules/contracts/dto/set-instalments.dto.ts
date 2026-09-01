import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
} from 'class-validator';

import { MONEY_RE, PositiveMoneyConstraint } from '../../../common/dto/money';

export class ContractInstalmentInputDto {
  @ApiProperty({ example: 'Advance on signing', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label!: string;

  @ApiPropertyOptional({
    example: '2026-10-15',
    description:
      'When this instalment falls due (ISO date). Omit for a milestone with no calendar date yet ("on handover").',
  })
  @IsOptional()
  // strict: true rejects calendar-invalid dates (2026-02-30) here rather
  // than as a raw Postgres 500 at insert time — same convention as
  // ConvertToProformaDto.validUntil.
  @IsISO8601({ strict: true })
  dueDate?: string;

  @ApiProperty({ example: '200000.00', description: 'ETB, up to 2 decimal places.' })
  @Matches(MONEY_RE, {
    message: 'amountEtb must be a non-negative decimal string with up to 2 decimals',
  })
  // A zero instalment is a row that means nothing and still prints on the
  // customer's schedule — reject it rather than let it pad a total.
  @Validate(PositiveMoneyConstraint)
  amountEtb!: string;
}

/**
 * The WHOLE schedule, replaced in one call. There is no add-one-instalment
 * endpoint: `sequence` is the agreed order printed on the document, so
 * inserting row 2 renumbers everything after it, and the instalments have to
 * add up to the contract value as a set. Both of those are properties of the
 * list, not of a row, so the list is the unit of change.
 *
 * An empty array clears the schedule.
 */
export class SetContractInstalmentsDto {
  @ApiProperty({ type: [ContractInstalmentInputDto] })
  @IsArray()
  // A payment schedule is a handful of milestones; 60 is five years of
  // monthly instalments and well past anything real. The bound exists so a
  // hostile payload can't make the server insert 100k rows in one request.
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ContractInstalmentInputDto)
  instalments!: ContractInstalmentInputDto[];
}
