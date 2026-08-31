import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateBankAccountDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  bankName?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  accountNumber?: string;

  @ApiPropertyOptional({
    description:
      'Deactivating an account with a non-zero balance is allowed — no warning field, the balance stays visible on the list endpoint.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
