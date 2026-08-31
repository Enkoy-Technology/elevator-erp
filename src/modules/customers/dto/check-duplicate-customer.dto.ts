import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CheckDuplicateCustomerDto {
  @ApiProperty({ example: 'Addis Heights PLC' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '+251949922604' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
