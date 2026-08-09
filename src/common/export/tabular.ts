import type { Response } from 'express';
import ExcelJS from 'exceljs';

export interface ColumnDef {
  key: string;
  header: string;
  format?: 'text' | 'money' | 'date';
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** Strips everything but `[A-Za-z0-9._-]` so a filename can't escape its directory or break the header. */
const sanitizeFilename = (filename: string): string =>
  filename.replace(/[^A-Za-z0-9._-]/g, '');

const setDownloadHeaders = (
  res: Response,
  filename: string,
  extension: string,
  contentType: string,
): void => {
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(filename)}.${extension}"`,
  );
};

/**
 * Formats a raw row value for export. Money and date values are passed through as strings
 * (never coerced to Number) so decimal precision and ISO formatting survive round-trip.
 */
export const formatCell = (
  value: unknown,
  // Unused: money/date semantics (never coerce to Number, pass ISO strings through)
  // fall out naturally from the string coercion below, since repos already return
  // money/date columns as strings. Kept for interface parity with ColumnDef.
  _format?: ColumnDef['format'],
): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- binding spec: coerce everything else with String(value)
  return String(value);
};

/** RFC 4180 field escaping: quote fields containing a quote, comma, or newline; double embedded quotes. */
const escapeCsvField = (field: string): string => {
  if (/["\n\r,]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
};

const writeWithBackpressure = async (
  res: Response,
  chunk: string | Buffer,
): Promise<void> => {
  const canContinue = res.write(chunk);
  if (!canContinue) {
    await new Promise<void>((resolve) => res.once('drain', resolve));
  }
};

export async function writeCsv(
  res: Response,
  filename: string,
  columns: ColumnDef[],
  rows: AsyncIterable<Record<string, unknown>>,
): Promise<void> {
  setDownloadHeaders(res, filename, 'csv', 'text/csv; charset=utf-8');

  await writeWithBackpressure(res, UTF8_BOM);
  await writeWithBackpressure(
    res,
    columns.map((col) => escapeCsvField(col.header)).join(',') + '\r\n',
  );

  for await (const row of rows) {
    const line =
      columns
        .map((col) => escapeCsvField(formatCell(row[col.key], col.format)))
        .join(',') + '\r\n';
    await writeWithBackpressure(res, line);
  }

  res.end();
}

export async function writeXlsx(
  res: Response,
  filename: string,
  columns: ColumnDef[],
  rows: AsyncIterable<Record<string, unknown>>,
): Promise<void> {
  setDownloadHeaders(
    res,
    filename,
    'xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );

  // useStyles: true — without it the streaming writer skips serializing cell
  // formatting (including the bold header) entirely, regardless of what's set on the row.
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: res,
    useStyles: true,
  });
  const sheet = workbook.addWorksheet('Export');

  const headerRow = sheet.addRow(columns.map((col) => col.header));
  headerRow.font = { bold: true };
  headerRow.commit();

  for await (const row of rows) {
    const values = columns.map((col) =>
      formatCell(row[col.key], col.format),
    );
    sheet.addRow(values).commit();
  }

  sheet.commit();
  await workbook.commit();
}
