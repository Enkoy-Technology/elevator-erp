import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { MONEY_RE, QUANTITY_RE } from '../../../common/dto/money';

export class CreateInvoiceLineDto {
  @ApiProperty({ example: 'Annual maintenance visit — March' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: '3.000', description: 'Up to 3 decimal places.' })
  @Matches(QUANTITY_RE, {
    message: 'quantity must be a positive decimal string with up to 3 decimals',
  })
  quantity!: string;

  @ApiProperty({ example: '10.00', description: 'ETB, up to 2 decimal places.' })
  @Matches(MONEY_RE, {
    message: 'unitPriceEtb must be a positive decimal string with up to 2 decimals',
  })
  unitPriceEtb!: string;
}

export class CreateInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiProperty({ type: [CreateInvoiceLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Payment due date (ISO date).',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueDate?: string;
}
