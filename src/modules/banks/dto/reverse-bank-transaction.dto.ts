import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReverseBankTransactionDto {
  @ApiProperty({ example: 'Mis-keyed amount — statement says 1,500.00 not 5,100.00', maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason!: string;
}
