import { Decimal } from 'decimal.js';

/**
 * A row kind is also its own sort key on same-day ties (see `buildStatement`
 * below) — 'invoice' < 'payment' < 'withholding' alphabetically happens to
 * match the real-world sequence (a customer is invoiced before they can pay
 * or have tax withheld against it), so no separate priority table is needed.
 */
export type StatementRowKind = 'invoice' | 'payment' | 'withholding';

/**
 * One money movement before merging: `amountEtb` is the DEBIT amount for an
 * 'invoice' row (raises what the customer owes) and the signed CREDIT amount
 * for 'payment'/'withholding' rows (lowers it) — a payment reversal is a
 * 'payment' row whose amountEtb is already negative (see payments schema's
 * own doc comment), so subtracting it naturally adds the reversed amount
 * back onto the balance with no special-casing here.
 */
export interface StatementSourceRow {
  id: string;
  kind: StatementRowKind;
  /** Business-calendar date ('YYYY-MM-DD', Africa/Addis_Ababa — see business-time.ts's `todayIso`). */
  date: string;
  reference: string;
  amountEtb: string;
}

export interface StatementRow {
  id: string;
  kind: StatementRowKind;
  date: string;
  reference: string;
  debit: string;
  credit: string;
  /** Running balance after this row is applied. */
  balance: string;
}

export interface StatementResult {
  openingBalance: string;
  closingBalance: string;
  rows: StatementRow[];
}

/** Debit for 'invoice' rows, credit (negated) for 'payment'/'withholding' rows — the one signed contribution every row makes to the running balance. */
function signedContribution(row: StatementSourceRow): Decimal {
  const amount = new Decimal(row.amountEtb);
  return row.kind === 'invoice' ? amount : amount.negated();
}

/**
 * Builds one customer statement: merges invoice (debit), payment/reversal
 * (credit) and withholding-credit (credit) rows into a single chronological
 * ledger with a running balance, an opening balance carried forward from
 * everything strictly before `from`, and a closing balance after the last
 * row in [from, to] (inclusive both ends).
 *
 * Sorted by (date, kind, id) — kind breaks a same-day tie per the
 * `StatementRowKind` doc comment, id is the final deterministic tiebreaker
 * for two rows of the same kind on the same day. The merge happens here in
 * TS, not as a SQL UNION view: CustomersRepository.statement() runs exactly
 * two queries (invoices, payments) scoped to one customer — two small
 * result sets are simpler to reason about and test than teaching Postgres
 * to interleave two differently-shaped tables, and a UNION view would be
 * premature until this feeds something with real query-planner pressure.
 *
 * Withholding is folded in as a third row *kind* sourced from the SAME
 * invoices query (no third query) — the task brief's own domain background
 * says it plainly: "AR is fully settled; only the cash differs." Treating a
 * withholding credit as anything other than a credit line means a fully
 * settled invoice (payment + WHT covering the total) would show a nonzero
 * closing balance here while every other view (the invoice's own PAID
 * status, `recomputeCustomerBalance`) shows zero — the exact class of
 * cross-view money disagreement this phase must not ship.
 */
export function buildStatement(params: {
  from: string;
  to: string;
  sourceRows: StatementSourceRow[];
}): StatementResult {
  const { from, to } = params;
  const sorted = [...params.sourceRows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const before = sorted.filter((row) => row.date < from);
  const inRange = sorted.filter((row) => row.date >= from && row.date <= to);

  const openingBalance = before
    .reduce((sum, row) => sum.plus(signedContribution(row)), new Decimal(0))
    .toFixed(2);

  let balance = new Decimal(openingBalance);
  const rows: StatementRow[] = inRange.map((row) => {
    balance = balance.plus(signedContribution(row));
    const amount = new Decimal(row.amountEtb);
    // A payment reversal is a 'payment' row with a negative amountEtb (see
    // StatementSourceRow's doc comment) — it re-raises what the customer
    // owes, so it belongs in DEBIT by its positive magnitude, not as a
    // negative number under CREDIT (which reads as a data error to an
    // accountant reconciling the exported CSV/XLSX). This only changes
    // presentation: signedContribution above still drives the running
    // balance and is untouched by it.
    const isDebit = row.kind === 'invoice' || amount.isNegative();
    const magnitude = amount.abs().toFixed(2);
    return {
      id: row.id,
      kind: row.kind,
      date: row.date,
      reference: row.reference,
      debit: isDebit ? magnitude : '0.00',
      credit: isDebit ? '0.00' : magnitude,
      balance: balance.toFixed(2),
    };
  });

  return {
    openingBalance,
    closingBalance: balance.toFixed(2),
    rows,
  };
}
