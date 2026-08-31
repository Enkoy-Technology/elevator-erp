import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBankAccountDto {
  @ApiProperty({ example: 'Operating Account', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'Commercial Bank of Ethiopia', maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bankName!: string;

  @ApiProperty({ example: '1000234567890', maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  accountNumber!: string;
}
