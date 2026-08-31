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
  // An empty `?format=` (as opposed to the param being absent entirely) is
  // still "no format requested" — treat it the same as undefined instead of
  // 400ing a client that sends an empty query value.
  if (format === undefined || format === '') {
    return undefined;
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestException(
      `format must be one of: ${EXPORT_FORMATS.join(', ')}`,
    );
  }
  return format as ExportFormat;
};

/**
 * `?format=` for the two bounded aggregate reports (AR aging, customer
 * statement) that gained a PDF option in task 5.3 — csv/xlsx (unchanged,
 * `EXPORT_FORMATS`) plus pdf. Deliberately its own constant/parser rather
 * than adding 'pdf' to `EXPORT_FORMATS` itself: every other list endpoint
 * using `parseExportFormat` (customers, invoices, proformas list exports)
 * has no PDF rendering path at all, and folding 'pdf' into the shared enum
 * would silently make it a "valid" value there too, one 400 short of a
 * TemplateNotImplementedError instead of the clear "format must be one of"
 * message this gives.
 */
export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

/** Same inline-validation shape as parseExportFormat, over REPORT_FORMATS instead of EXPORT_FORMATS. */
export const parseReportFormat = (format?: string): ReportFormat | undefined => {
  if (format === undefined || format === '') {
    return undefined;
  }
  if (!(REPORT_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestException(
      `format must be one of: ${REPORT_FORMATS.join(', ')}`,
    );
  }
  return format as ReportFormat;
};
