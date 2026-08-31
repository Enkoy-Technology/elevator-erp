import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const IMPORT_ROW_STATUSES = [
  'READY',
  'CREATED',
  'SKIPPED_DUPLICATE',
  'ERROR',
] as const;

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export class ImportEmployeeRowDto {
  @ApiProperty({
    example: 4,
    description: '1-based row number in the uploaded sheet, so a person can find it.',
  })
  rowNumber!: number;

  @ApiProperty({ type: String, nullable: true, example: 'Abebe Kebede' })
  fullName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'abebe@shiningstar.et' })
  email!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Sales Manager',
    description: 'The role exactly as written in the sheet, before mapping.',
  })
  role!: string | null;

  @ApiProperty({ enum: IMPORT_ROW_STATUSES })
  status!: ImportRowStatus;

  @ApiPropertyOptional({
    description: 'Why the row errored or was skipped.',
    example: 'Row 4: role "Chief" is not a valid role.',
  })
  message?: string;

  @ApiPropertyOptional({
    description:
      'Server-generated password, returned ONCE on commit for CREATED rows only. Never stored in plaintext and never logged — hand it to the employee and it is gone.',
  })
  temporaryPassword?: string;
}

export class ImportEmployeesResultDto {
  @ApiProperty({
    description: 'True when nothing was written. Send commit=true to write.',
  })
  dryRun!: boolean;

  @ApiProperty({ description: 'Data rows found in the sheet (blank rows excluded).' })
  totalRows!: number;

  @ApiProperty({ description: 'Employees actually created. Always 0 on a dry run.' })
  created!: number;

  @ApiProperty({ type: [ImportEmployeeRowDto] })
  rows!: ImportEmployeeRowDto[];
}
