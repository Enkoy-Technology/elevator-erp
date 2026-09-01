import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelContractDto {
  @ApiProperty({
    example: 'Customer withdrew before signing',
    maxLength: 2000,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  reason!: string;
}
