import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VoidInvoiceDto {
  @ApiProperty({ example: 'Issued in error — wrong customer', maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason!: string;
}
