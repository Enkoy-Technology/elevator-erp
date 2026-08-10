export interface FiscalYear {
  start: string;
  end: string;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/**
 * Ethiopian fiscal year runs from `boundary` (MM-DD, e.g. '07-08' = 8 Hamle /
 * 8 July) through the day before that boundary the next year. Pure date
 * arithmetic — no external date library.
 *
 * Extracted from RatesService (Phase 1, where it backs VAT-rate lookups) so
 * gapless document numbering (proformas now, invoices/receipts in Phase 4)
 * can reuse the exact same fiscal-year math from the repository layer
 * without a repository depending on a service.
 */
export function computeFiscalYear(dateStr: string, boundary: string): FiscalYear {
  const [monthStr, dayStr] = boundary.split('-');
  const boundaryMonth = Number(monthStr);
  const boundaryDay = Number(dayStr);
  const year = Number(dateStr.slice(0, 4));
  const dateMonthDay = dateStr.slice(5);
  const startYear = dateMonthDay >= boundary ? year : year - 1;

  const endExclusive = new Date(
    Date.UTC(startYear + 1, boundaryMonth - 1, boundaryDay),
  );
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);

  return {
    start: `${startYear}-${boundary}`,
    end: formatDate(endExclusive),
    label: `FY${startYear}/${pad2((startYear + 1) % 100)}`,
  };
}
