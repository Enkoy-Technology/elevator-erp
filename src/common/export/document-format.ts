import { BadRequestException } from '@nestjs/common';

/** Supported formats for `GET .../:id/document?format=`. */
export const DOCUMENT_FORMATS = ['pdf', 'docx', 'xlsx'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/**
 * Same inline-validation shape as export-query.dto.ts's parseExportFormat,
 * but format is required here — there is no bare-JSON fallback for a
 * single-document download the way list endpoints fall back to a page of
 * JSON when `?format=` is omitted.
 */
export const parseDocumentFormat = (format?: string): DocumentFormat => {
  if (!format || !(DOCUMENT_FORMATS as readonly string[]).includes(format)) {
    throw new BadRequestException(
      `format must be one of: ${DOCUMENT_FORMATS.join(', ')}`,
    );
  }
  return format as DocumentFormat;
};
