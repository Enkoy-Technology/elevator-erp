import { EventEmitter } from 'node:events';
import ExcelJS from 'exceljs';
import { formatCell, writeCsv, writeXlsx, type ColumnDef } from './tabular';

/** Minimal mock of express Response: captures written chunks, `write` always returns true (no backpressure). */
class MockResponse extends EventEmitter {
  headers: Record<string, string> = {};
  chunks: Buffer[] = [];
  ended = false;
  writeReturnValue = true;
  drainWaits = 0;

  setHeader(name: string, value: string): this {
    this.headers[name.toLowerCase()] = value;
    return this;
  }

  write(chunk: unknown): boolean {
    this.chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
    );
    if (!this.writeReturnValue) {
      // Simulate the socket draining on the next tick, like a real backpressured stream.
      this.drainWaits += 1;
      setImmediate(() => this.emit('drain'));
    }
    return this.writeReturnValue;
  }

  end(chunk?: unknown): this {
    if (chunk !== undefined) {
      this.write(chunk);
    }
    this.ended = true;
    this.emit('finish');
    return this;
  }

  buffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  /** Body text with the leading UTF-8 BOM (if any) stripped, for assertions that don't care about it. */
  textWithoutBom(): string {
    const buf = this.buffer();
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const body = buf.subarray(0, 3).equals(bom) ? buf.subarray(3) : buf;
    return body.toString('utf8');
  }
}

async function* rowsOf(
  rows: Record<string, unknown>[],
): AsyncIterable<Record<string, unknown>> {
  for (const row of rows) {
    yield row;
  }
}

const columns: ColumnDef[] = [
  { key: 'name', header: 'Name' },
  { key: 'amount', header: 'Amount', format: 'money' },
];

describe('formatCell', () => {
  it('returns empty string for null and undefined', () => {
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
  });

  it('formats a Date instance as an ISO date string', () => {
    const d = new Date('2026-08-08T12:34:56.000Z');
    expect(formatCell(d)).toBe(d.toISOString());
  });

  it('coerces other values with String()', () => {
    expect(formatCell(42)).toBe('42');
    expect(formatCell('hello')).toBe('hello');
    expect(formatCell(true)).toBe('true');
  });

  it('passes money strings through unchanged (no numeric coercion)', () => {
    expect(formatCell('12345678.90', 'money')).toBe('12345678.90');
  });

  it('passes date strings through unchanged', () => {
    expect(formatCell('2026-08-08', 'date')).toBe('2026-08-08');
  });
});

describe('writeCsv', () => {
  it('sets Content-Type and Content-Disposition headers, sanitizing the filename', async () => {
    const res = new MockResponse();
    await writeCsv(res as never, '../etc/passwd', columns, rowsOf([]));
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="..etcpasswd.csv"',
    );
  });

  it('writes a UTF-8 BOM as the very first bytes', async () => {
    const res = new MockResponse();
    await writeCsv(res as never, 'report', columns, rowsOf([]));
    const buf = res.buffer();
    expect(buf.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  });

  it('writes the header row in column order, then data rows, with CRLF endings', async () => {
    const res = new MockResponse();
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name: 'Abebe', amount: '100.00' }]),
    );
    expect(res.textWithoutBom()).toBe('Name,Amount\r\nAbebe,100.00\r\n');
  });

  it('quotes a field containing a comma', async () => {
    const res = new MockResponse();
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name: 'Doe, John', amount: '1' }]),
    );
    expect(res.textWithoutBom()).toBe('Name,Amount\r\n"Doe, John",1\r\n');
  });

  it('doubles an embedded quote and wraps the field in quotes', async () => {
    const res = new MockResponse();
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name: 'Say "hi"', amount: '1' }]),
    );
    expect(res.textWithoutBom()).toBe('Name,Amount\r\n"Say ""hi""",1\r\n');
  });

  it('quotes a field containing a newline', async () => {
    const res = new MockResponse();
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name: 'line1\nline2', amount: '1' }]),
    );
    expect(res.textWithoutBom()).toBe('Name,Amount\r\n"line1\nline2",1\r\n');
  });

  it('preserves an Ethiopic string byte-identical after the BOM', async () => {
    const res = new MockResponse();
    const name = 'ኃይሌ ገብረሥላሴ';
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name, amount: '1' }]),
    );
    expect(res.textWithoutBom()).toBe(`Name,Amount\r\n${name},1\r\n`);
  });

  it('keeps a money string exact (no float rounding)', async () => {
    const res = new MockResponse();
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([{ name: 'x', amount: '12345678.90' }]),
    );
    expect(res.textWithoutBom()).toContain('12345678.90');
  });

  it('awaits drain when write() reports backpressure, then still writes every row', async () => {
    const res = new MockResponse();
    res.writeReturnValue = false;
    await writeCsv(
      res as never,
      'report',
      columns,
      rowsOf([
        { name: 'a', amount: '1' },
        { name: 'b', amount: '2' },
      ]),
    );
    // BOM + header + 2 rows, each backpressured, each waited on 'drain'.
    expect(res.drainWaits).toBe(4);
    expect(res.ended).toBe(true);
    expect(res.textWithoutBom()).toBe('Name,Amount\r\na,1\r\nb,2\r\n');
  });

  it('calls res.end() when the iterable completes', async () => {
    const res = new MockResponse();
    await writeCsv(res as never, 'report', columns, rowsOf([]));
    expect(res.ended).toBe(true);
  });
});

describe('writeXlsx', () => {
  it('sets Content-Type and sanitized Content-Disposition headers', async () => {
    const res = new MockResponse();
    await writeXlsx(res as never, '../etc/passwd', columns, rowsOf([]));
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="..etcpasswd.xlsx"',
    );
  });

  it('produces a workbook readable by ExcelJS with header, exact money string, and an Ethiopic cell', async () => {
    const res = new MockResponse();
    const name = 'ኃይሌ ገብረሥላሴ';
    await writeXlsx(
      res as never,
      'report',
      columns,
      rowsOf([{ name, amount: '9999999999.99' }]),
    );
    expect(res.ended).toBe(true);

    const workbook = new ExcelJS.Workbook();
    // exceljs's own .d.ts locally shadows `Buffer` with `interface Buffer extends ArrayBuffer {}`,
    // which is a different (incompatible) type from @types/node's Buffer. Cast through the
    // parameter's own inferred type rather than the ambiguous `Buffer` name.
    await workbook.xlsx.load(
      res.buffer() as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet('Export');
    expect(sheet).toBeDefined();

    const headerRow = sheet!.getRow(1);
    expect(headerRow.getCell(1).value).toBe('Name');
    expect(headerRow.getCell(2).value).toBe('Amount');
    expect(headerRow.getCell(1).font?.bold).toBe(true);

    const dataRow = sheet!.getRow(2);
    expect(dataRow.getCell(1).value).toBe(name);
    expect(dataRow.getCell(2).value).toBe('9999999999.99');
    expect(typeof dataRow.getCell(2).value).toBe('string');
  });

  it('writes empty string for null/undefined cell values', async () => {
    const res = new MockResponse();
    await writeXlsx(
      res as never,
      'report',
      columns,
      rowsOf([{ name: null, amount: undefined }]),
    );

    const workbook = new ExcelJS.Workbook();
    // exceljs's own .d.ts locally shadows `Buffer` with `interface Buffer extends ArrayBuffer {}`,
    // which is a different (incompatible) type from @types/node's Buffer. Cast through the
    // parameter's own inferred type rather than the ambiguous `Buffer` name.
    await workbook.xlsx.load(
      res.buffer() as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
    const sheet = workbook.getWorksheet('Export')!;
    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(1).value ?? '').toBe('');
    expect(dataRow.getCell(2).value ?? '').toBe('');
  });
});
