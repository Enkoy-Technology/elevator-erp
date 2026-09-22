import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One data row of the sheet, parsed. Shown on a dry run, returned on commit. */
export class ImportSiteSurveyRowDto {
  @ApiProperty({
    example: 6,
    description:
      '1-based row number in the uploaded sheet, so a person can find it.',
  })
  rowNumber!: number;

  @ApiProperty({ example: 'Belachew' })
  projectName!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  address?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactName?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  contactPhone?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 200 })
  shaftWidthCm?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 180 })
  shaftDepthCm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'B+G+11' })
  floors?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  overheadCm?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'With MR' })
  machineRoom?: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  units?: number | null;
}

export class ImportSiteSurveyErrorDto {
  @ApiProperty({ example: 8, description: 'The row number as Excel shows it.' })
  row!: number;

  @ApiProperty({ example: 'Shaft width "wide" is not a number.' })
  message!: string;
}

export class ImportSiteSurveysResultDto {
  @ApiProperty({
    description: 'True when nothing was written. Send commit=true to write.',
  })
  dryRun!: boolean;

  @ApiProperty({
    description: 'Data rows found below the header (blank rows excluded).',
  })
  totalRows!: number;

  @ApiProperty({
    description: 'Surveys actually written. Always 0 on a dry run.',
  })
  imported!: number;

  @ApiProperty({
    description: 'Rows the import could not use — the same count as `errors`.',
  })
  skipped!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Betelhem tesfa and nafyad',
    description:
      'Who the sheet says collected it, from the line above its header. Null when the sheet does not say.',
  })
  collectedByName!: string | null;

  @ApiProperty({ type: [ImportSiteSurveyErrorDto] })
  errors!: ImportSiteSurveyErrorDto[];

  @ApiProperty({
    type: [ImportSiteSurveyRowDto],
    description: 'The surveys that were created, or would be on commit.',
  })
  rows!: ImportSiteSurveyRowDto[];
}
