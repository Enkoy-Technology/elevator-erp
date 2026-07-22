import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { USER_ROLES, type UserRole } from '../../../types/auth.types';

/** Staff roles only — CUSTOMER is not an employee. */
export const EMPLOYEE_ROLES = USER_ROLES.filter(
  (r: UserRole) => r !== 'CUSTOMER',
);

export class CreateEmployeeDto {
  @ApiProperty({ example: 'sales@shiningstar.et' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Abebe Kebede' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: '+251911000000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiProperty({ enum: EMPLOYEE_ROLES, example: 'SALES_MANAGER' })
  @IsEnum(EMPLOYEE_ROLES)
  role!: (typeof EMPLOYEE_ROLES)[number];

  @ApiProperty({ example: 'TempPass!123', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ enum: EMPLOYEE_ROLES })
  @IsOptional()
  @IsEnum(EMPLOYEE_ROLES)
  role?: (typeof EMPLOYEE_ROLES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
