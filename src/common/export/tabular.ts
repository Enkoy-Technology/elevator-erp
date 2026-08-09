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

// CSV formula/DDE injection: Excel treats a field starting with = + - @ (optionally after a
// leading tab/CR used to dodge naive checks) as a live formula when the CSV is opened. A
// leading `'` forces Excel to treat the field as text. CSV path only — ExcelJS (writeXlsx)
// sets plain string cell values, which Excel never evaluates as formulas, so the XLSX path
// must NOT get this treatment.
const FORMULA_INJECTION_RE = /^[\t\r]*[=+@-]/;

const neutralizeCsvFormula = (field: string): string =>
  FORMULA_INJECTION_RE.test(field) ? `'${field}` : field;

const writeWithBackpressure = async (
  res: Response,
  chunk: string | Buffer,
): Promise<void> => {
  const canContinue = res.write(chunk);
  if (canContinue) {
    return;
  }
  // Race drain against the response closing/erroring (e.g. client disconnect mid-export).
  // Without this, a cancelled request parks here forever: the for-await loop never resumes,
  // the row iterable (a DB cursor in callers) never gets return()/finally-cleaned up, and the
  // request is uncancellable.
  await new Promise<void>((resolve, reject) => {
    const onDrain = (): void => {
      res.off('close', onClose);
      res.off('error', onError);
      resolve();
    };
    const onClose = (): void => {
      res.off('drain', onDrain);
      res.off('error', onError);
      reject(new Error('Response closed before drain (client disconnected)'));
    };
    const onError = (err: Error): void => {
      res.off('drain', onDrain);
      res.off('close', onClose);
      reject(err);
    };
    res.once('drain', onDrain);
    res.once('close', onClose);
    res.once('error', onError);
  });
};

/**
 * Headers are already sent by the time a write can fail (backpressure wait rejected, or the
 * row iterator itself throws mid-stream — e.g. a DB cursor error). The global exception filter
 * can't turn either into a fresh HTTP response at that point, so destroy the socket directly
 * instead of letting the response hang half-written.
 */
const destroyOnError = (res: Response, err: unknown): never => {
  const error = err instanceof Error ? err : new Error(String(err));
  res.destroy(error);
  throw error;
};

export async function writeCsv(
  res: Response,
  filename: string,
  columns: ColumnDef[],
  rows: AsyncIterable<Record<string, unknown>>,
): Promise<void> {
  setDownloadHeaders(res, filename, 'csv', 'text/csv; charset=utf-8');

  try {
    await writeWithBackpressure(res, UTF8_BOM);
    await writeWithBackpressure(
      res,
      columns.map((col) => escapeCsvField(col.header)).join(',') + '\r\n',
    );

    for await (const row of rows) {
      const line =
        columns
          .map((col) => {
            const value = formatCell(row[col.key], col.format);
            // Money columns are trusted internal decimal strings (never tenant free text) —
            // exempt them so a legitimate leading '-' on a negative amount stays clean.
            const safe =
              col.format === 'money' ? value : neutralizeCsvFormula(value);
            return escapeCsvField(safe);
          })
          .join(',') + '\r\n';
      await writeWithBackpressure(res, line);
    }

    res.end();
  } catch (err) {
    destroyOnError(res, err);
  }
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

  try {
    for await (const row of rows) {
      const values = columns.map((col) =>
        formatCell(row[col.key], col.format),
      );
      sheet.addRow(values).commit();
    }

    sheet.commit();
    await workbook.commit();
  } catch (err) {
    destroyOnError(res, err);
  }
}
