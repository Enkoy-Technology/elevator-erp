import { BadRequestException } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';

/** Supported bulk-export formats for `?format=` on list endpoints. */
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Composable query shape for `?format=csv|xlsx` on list endpoints. None of
 * the six list controllers currently bind `@Query()` to a DTO class — each
 * validates its params inline with manual checks + BadRequestException (see
 * the `status` handling in projects/maintenance) — so this class documents
 * the shape for anything that does compose query DTOs, while
 * `parseExportFormat` below backs the inline style the existing controllers
 * actually use.
 */
export class ExportQueryDto {
  @IsOptional()
  @IsIn(EXPORT_FORMATS)
  format?: ExportFormat;
}

/**
 * Same inline-validation shape every controller already uses for its own
 * enum query params (status, category, ...): undefined passes through,
 * anything else must be one of the known values or the request 400s.
 */
export const parseExportFormat = (format?: string): ExportFormat | undefined => {
  if (format === undefined) {
    return undefined;
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestException(
      `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
    );
  }
  return format as ExportFormat;
};
