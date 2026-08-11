import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ReversePaymentDto {
  @ApiProperty({ example: 'Duplicate entry — same cheque recorded twice', maxLength: 2000 })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason!: string;
}
