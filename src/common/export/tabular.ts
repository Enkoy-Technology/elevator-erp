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
// Trade-off (standard OWASP CSV-injection mitigation): this also prefixes legitimate text that
// happens to start with +/-/@, e.g. a "+251..." phone number column — accepted, since there's
// no way to distinguish that from a payload by shape alone, and a stray leading `'` in a phone
// number is far cheaper than a live formula/DDE exploit in a downloaded export.
const FORMULA_INJECTION_RE = /^[\t\r]*[=+@-]/;

const neutralizeCsvFormula = (field: string): string =>
  FORMULA_INJECTION_RE.test(field) ? `'${field}` : field;

/**
 * Races an arbitrary operation against the response closing/erroring (e.g. a client disconnect
 * mid-export). `attach(resolve, reject)` wires up the operation's own completion and returns a
 * detach callback; whichever side settles first wins, and every listener — the shared
 * close/error pair plus whatever `attach` registered — is removed on every branch so nothing
 * leaks. Without this, a cancelled request can park forever: a pending write never resumes, an
 * `await workbook.commit()` never resolves (ExcelJS's finalizer only listens for the stream's
 * 'finish'/'error', never 'close'), and the row iterable (a DB cursor in callers) never gets
 * cleaned up.
 */
const raceAgainstDisconnect = <T>(
  res: Response,
  attach: (
    resolve: (value: T) => void,
    reject: (err: Error) => void,
  ) => () => void,
): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    // Must stay `let`, assigned after res.once() below: attach() can settle synchronously
    // (onClose/onError firing before attach() returns), and a `const` here would leave onClose/
    // onError reading `detach` out of its temporal dead zone in that exact case.
    // eslint-disable-next-line prefer-const
    let detach: (() => void) | undefined;
    const onClose = (): void => {
      detach?.();
      res.off('error', onError);
      reject(
        new Error('Response closed before completion (client disconnected)'),
      );
    };
    const onError = (err: Error): void => {
      detach?.();
      res.off('close', onClose);
      reject(err);
    };
    res.once('close', onClose);
    res.once('error', onError);
    // attach() may settle synchronously (e.g. a test firing 'close' as a direct side effect);
    // `detach` is assigned before that can matter since resolve/reject are idempotent.
    detach = attach(
      (value) => {
        res.off('close', onClose);
        res.off('error', onError);
        resolve(value);
      },
      (err) => {
        res.off('close', onClose);
        res.off('error', onError);
        reject(err);
      },
    );
  });

const writeWithBackpressure = async (
  res: Response,
  chunk: string | Buffer,
): Promise<void> => {
  const canContinue = res.write(chunk);
  if (canContinue) {
    return;
  }
  await raceAgainstDisconnect<void>(res, (resolve, _reject) => {
    res.once('drain', resolve);
    return () => res.off('drain', resolve);
  });
};

/** Drives one step of an async iterator, racing it against the response's close/error. */
const nextResolvers =
  <T>(iterator: AsyncIterator<T>) =>
  (
    resolve: (value: IteratorResult<T>) => void,
    reject: (err: Error) => void,
  ): (() => void) => {
    let cancelled = false;
    void iterator.next().then(
      (result) => {
        if (!cancelled) resolve(result);
      },
      (err: unknown) => {
        if (!cancelled) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );
    return () => {
      cancelled = true;
    };
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

  // Acquired inside try (not before) so a runtime-non-iterable `rows` throws into the
  // catch/destroyOnError path below instead of escaping teardown.
  let iterator: AsyncIterator<Record<string, unknown>> | undefined;
  try {
    iterator = rows[Symbol.asyncIterator]();
    // row.commit() is a real stream write, so the header must be protected by the same
    // try/catch as the row loop below, not run before it.
    const headerRow = sheet.addRow(columns.map((col) => col.header));
    headerRow.font = { bold: true };
    headerRow.commit();

    // Drive the iterator by hand (instead of `for await`) so each step can be raced against
    // the response closing/erroring — a disconnect mid-export must interrupt the loop rather
    // than wait for a row that's never going to be consumed.
    for (
      let step = await raceAgainstDisconnect(res, nextResolvers(iterator));
      !step.done;
      step = await raceAgainstDisconnect(res, nextResolvers(iterator))
    ) {
      const values = columns.map((col) =>
        formatCell(step.value[col.key], col.format),
      );
      sheet.addRow(values).commit();
    }

    sheet.commit();
    // ExcelJS gives no way to abort an in-flight commit(), so a losing detach here is a no-op —
    // the promise just gets ignored once the race is lost, unlike the drain/next-step races
    // above which can genuinely stop listening.
    await raceAgainstDisconnect<void>(res, (resolve, reject) => {
      void workbook.commit().then(resolve, reject);
      return () => {};
    });
  } catch (err) {
    // Run the row iterable's cleanup (e.g. a DB cursor's `finally`) even when we bailed out
    // early on a disconnect rather than the iterable completing or throwing itself. Mirrors
    // native `for await`'s IteratorClose: a throwing/rejecting return() must not shadow the
    // loop's own error or skip destroying the response.
    try {
      await iterator?.return?.();
    } catch {
      // Original `err` below still wins; res still gets destroyed.
    }
    destroyOnError(res, err);
  }
}
