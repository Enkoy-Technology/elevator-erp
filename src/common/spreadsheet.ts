import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

/** One physical row of a sheet, with the 1-based row number a person sees in Excel. */
export interface SheetRow {
  rowNumber: number;
  cells: string[];
}

/**
 * Rows past this are rejected before iterating rather than loaded. 500 rather
 * than something larger because the one consumer (employee import) bcrypts a
 * password per row at cost 12 (~250ms each, 4 libuv threads), so a 500-row
 * file already costs ~30s of hashing.
 * ponytail: single cap shared by reader and importer; split it if a second
 * consumer appears that does no per-row hashing.
 */
export const MAX_SHEET_ROWS = 500;

export class SheetTooLargeError extends BadRequestException {
  constructor(rowCount: number) {
    super(
      `The sheet has ${rowCount} rows; the limit is ${MAX_SHEET_ROWS}. Split the file and import it in parts.`,
    );
  }
}

/**
 * RFC 4180 CSV: a comma inside a quoted field, an escaped `""`, and a newline
 * inside quotes all stay inside their field. Hand-rolled rather than run
 * through ExcelJS's csv reader because that one coerces cell text to numbers
 * and dates — which silently turns `0911234567` into 911234567 and loses the
 * leading zero on every Ethiopian phone number in the file.
 */
const parseCsv = (text: string): SheetRow[] => {
  const rows: SheetRow[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;

  const endRow = (): void => {
    cells.push(field);
    rows.push({ rowNumber: rows.length + 1, cells });
    cells = [];
    field = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\n') {
      endRow();
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  // A trailing newline must not manufacture an empty final row.
  if (field !== '' || cells.length > 0) {
    endRow();
  }
  return rows;
};

/**
 * Reads an uploaded .xlsx or .csv buffer into plain string rows. Everything is
 * returned as text — the caller decides what a cell means; nothing here
 * guesses at numbers or dates.
 */
export const readSpreadsheet = async (
  buffer: Buffer,
  filename: string,
): Promise<SheetRow[]> => {
  if (filename.toLowerCase().endsWith('.csv')) {
    // Strip a UTF-8 BOM — Excel writes one on every CSV it saves, and it would
    // otherwise become part of the first header name.
    const rows = parseCsv(buffer.toString('utf8').replace(/^\uFEFF/, ''));
    if (rows.length > MAX_SHEET_ROWS) {
      throw new SheetTooLargeError(rows.length);
    }
    return rows;
  }

  const workbook = new ExcelJS.Workbook();
  // exceljs ships a global `declare interface Buffer extends ArrayBuffer {}`
  // that predates @types/node's now-generic Buffer, so the two no longer line
  // up structurally. The cast is purely to satisfy that stale declaration —
  // `load` hands the value straight to JSZip, which takes a Node Buffer.
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return [];
  }
  if (sheet.rowCount > MAX_SHEET_ROWS) {
    throw new SheetTooLargeError(sheet.rowCount);
  }

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const cells: string[] = [];
    // `cellCount` is the last populated column; index 1..n, since ExcelJS
    // columns are 1-based and getCell(0) is not a thing.
    for (let col = 1; col <= row.cellCount; col += 1) {
      // `.text` is ExcelJS's own display string — it resolves rich text,
      // hyperlinks, and formula results without us reaching into cell.value.
      cells.push(row.getCell(col).text);
    }
    rows.push({ rowNumber, cells });
  });
  return rows;
};
