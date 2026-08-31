import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelProformaDto {
  @ApiProperty({ example: 'Customer withdrew the order', maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason!: string;
}
