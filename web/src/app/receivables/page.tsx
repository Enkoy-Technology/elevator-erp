'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { btnGhost, btnPrimary, fieldClass, labelClass } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import { formatEtb, isZeroEtb, sumEtb } from '@/lib/money';
import {
  ApiError,
  downloadAgingReport,
  downloadCustomerStatement,
  getAccessToken,
  getAgingReport,
  getCustomerStatement,
  listCustomers,
  optional,
  type AgingRow,
  type Customer,
  type CustomerStatement,
  type ReportFormat,
  type StatementRowKind,
} from '@/lib/api';

type View = 'aging' | 'statement';

const STATEMENT_ROW_LABEL: Record<StatementRowKind, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  withholding: 'Withholding',
};

// Local-calendar date, not UTC: toISOString() on a Date built from local
// y/m/d fields shifts to the previous day for any positive UTC offset
// (e.g. Africa/Addis_Ababa, UTC+3 — local midnight is still "yesterday" in
// UTC), which showed up live as this picker defaulting "From" to the last
// day of the PRIOR month. Reading the local getters back out avoids the UTC
// round-trip entirely, matching what <input type="date"> itself shows.
const pad2 = (n: number): string => String(n).padStart(2, '0');
const toLocalIso = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const todayIso = (): string => toLocalIso(new Date());

const firstOfMonthIso = (): string => {
  const now = new Date();
  return toLocalIso(new Date(now.getFullYear(), now.getMonth(), 1));
};

const REPORT_FORMATS: readonly ReportFormat[] = ['csv', 'xlsx', 'pdf'];

export default function ReceivablesPage() {
  const router = useRouter();
  const [view, setView] = useState<View>('aging');

  const [customers, setCustomers] = useState<Customer[]>([]);

  const [aging, setAging] = useState<AgingRow[]>([]);
  const [agingLoading, setAgingLoading] = useState(true);
  const [agingError, setAgingError] = useState<string | null>(null);
  const [agingDownloading, setAgingDownloading] = useState(false);

  const [statementCustomerId, setStatementCustomerId] = useState('');
  const [statementFrom, setStatementFrom] = useState(firstOfMonthIso());
  const [statementTo, setStatementTo] = useState(todayIso());
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementDownloading, setStatementDownloading] = useState(false);

  const loadAging = useCallback(async () => {
    setAgingLoading(true);
    setAgingError(null);
    try {
      setAging(await getAgingReport());
    } catch (err) {
      setAgingError(err instanceof ApiError ? err.message : 'Failed to load aging report');
    } finally {
      setAgingLoading(false);
    }
  }, []);

  const loadStatement = useCallback(
    async (customerId: string, from: string, to: string) => {
      if (!customerId || !from || !to) {
        setStatement(null);
        return;
      }
      if (from > to) {
        setStatementError('From date must not be after the to date.');
        return;
      }
      setStatementLoading(true);
      setStatementError(null);
      try {
        setStatement(await getCustomerStatement(customerId, from, to));
      } catch (err) {
        setStatementError(
          err instanceof ApiError ? err.message : 'Failed to load customer statement',
        );
      } finally {
        setStatementLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (new URLSearchParams(window.location.search).get('view') === 'statement') {
      setView('statement');
    }
    void (async () => {
      const customerPage = await optional(listCustomers({ page: 1, pageSize: 100 }));
      setCustomers(customerPage.items);
    })();
    void loadAging();
  }, [router, loadAging]);

  const switchView = (next: View) => {
    setView(next);
    router.replace(next === 'statement' ? '/receivables?view=statement' : '/receivables', {
      scroll: false,
    });
  };

  const onSubmitStatement = (event: FormEvent) => {
    event.preventDefault();
    void loadStatement(statementCustomerId, statementFrom, statementTo);
  };

  const onDownloadAging = async (format: ReportFormat) => {
    setAgingDownloading(true);
    setAgingError(null);
    try {
      await downloadAgingReport(format);
    } catch (err) {
      setAgingError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setAgingDownloading(false);
    }
  };

  const onDownloadStatement = async (format: ReportFormat) => {
    if (!statementCustomerId || !statementFrom || !statementTo) {
      return;
    }
    setStatementDownloading(true);
    setStatementError(null);
    try {
      await downloadCustomerStatement(statementCustomerId, statementFrom, statementTo, format);
    } catch (err) {
      setStatementError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setStatementDownloading(false);
    }
  };

  const agingTotals = {
    current: sumEtb(aging.map((row) => row.current)),
    d1_30: sumEtb(aging.map((row) => row.d1_30)),
    d31_60: sumEtb(aging.map((row) => row.d31_60)),
    d61_90: sumEtb(aging.map((row) => row.d61_90)),
    d90_plus: sumEtb(aging.map((row) => row.d90_plus)),
    total: sumEtb(aging.map((row) => row.total)),
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Receivables</h1>
              <p className="text-sm text-slate-500">
                Aging and customer statements (amounts in ETB, read-only)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/invoices" className={btnGhost}>
                Invoices
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => switchView('aging')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === 'aging'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Aging
            </button>
            <button
              type="button"
              onClick={() => switchView('statement')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === 'statement'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Statement
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {view === 'aging' ? (
              <>
                {agingError ? (
                  <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {agingError}
                  </p>
                ) : null}
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Per-invoice outstanding by customer, as of today. Excludes
                    unapplied cash — see a customer&apos;s own net balance for that.
                  </p>
                  <div className="flex items-center gap-1">
                    {REPORT_FORMATS.map((format) => (
                      <button
                        key={format}
                        type="button"
                        disabled={agingDownloading || aging.length === 0}
                        onClick={() => void onDownloadAging(format)}
                        className={`${btnGhost} px-2 py-1 text-xs uppercase`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </div>

                {agingLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : aging.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                    <p className="text-sm text-slate-500">
                      No customer has an outstanding balance.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-4 font-semibold">Customer</th>
                          <th className="py-2 pr-4 text-right font-semibold">Current</th>
                          <th className="py-2 pr-4 text-right font-semibold">1-30</th>
                          <th className="py-2 pr-4 text-right font-semibold">31-60</th>
                          <th className="py-2 pr-4 text-right font-semibold">61-90</th>
                          <th className="py-2 pr-4 text-right font-semibold">90+</th>
                          <th className="py-2 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aging.map((row) => (
                          <tr key={row.customerId} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 pr-4 text-slate-900">
                              {row.customerName ?? row.customerId.slice(0, 8)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {formatEtb(row.current)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {formatEtb(row.d1_30)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {formatEtb(row.d31_60)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {formatEtb(row.d61_90)}
                            </td>
                            <td className="py-3 pr-4 text-right text-slate-600">
                              {formatEtb(row.d90_plus)}
                            </td>
                            <td className="py-3 text-right font-semibold text-navy-800">
                              {formatEtb(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 text-sm font-semibold text-navy-800">
                          <td className="py-3 pr-4">Total</td>
                          <td className="py-3 pr-4 text-right">
                            {formatEtb(agingTotals.current)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatEtb(agingTotals.d1_30)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatEtb(agingTotals.d31_60)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatEtb(agingTotals.d61_90)}
                          </td>
                          <td className="py-3 pr-4 text-right">
                            {formatEtb(agingTotals.d90_plus)}
                          </td>
                          <td className="py-3 text-right">
                            {formatEtb(agingTotals.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                {statementError ? (
                  <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {statementError}
                  </p>
                ) : null}
                <form
                  onSubmit={onSubmitStatement}
                  className="mb-4 flex flex-wrap items-end gap-3"
                >
                  <div className="min-w-[220px] flex-1">
                    <label className={labelClass} htmlFor="stmt-customer">
                      Customer
                    </label>
                    <select
                      id="stmt-customer"
                      className={fieldClass}
                      required
                      value={statementCustomerId}
                      onChange={(e) => setStatementCustomerId(e.target.value)}
                    >
                      <option value="">Select a customer</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="stmt-from">
                      From
                    </label>
                    <input
                      id="stmt-from"
                      type="date"
                      className={fieldClass}
                      required
                      value={statementFrom}
                      onChange={(e) => setStatementFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="stmt-to">
                      To
                    </label>
                    <input
                      id="stmt-to"
                      type="date"
                      className={fieldClass}
                      required
                      value={statementTo}
                      onChange={(e) => setStatementTo(e.target.value)}
                    />
                  </div>
                  <button type="submit" className={btnPrimary}>
                    Load
                  </button>
                  <div className="ml-auto flex items-center gap-1">
                    {REPORT_FORMATS.map((format) => (
                      <button
                        key={format}
                        type="button"
                        disabled={statementDownloading || !statement}
                        onClick={() => void onDownloadStatement(format)}
                        className={`${btnGhost} px-2 py-1 text-xs uppercase`}
                      >
                        {format}
                      </button>
                    ))}
                  </div>
                </form>

                {statementLoading ? (
                  <p className="text-sm text-slate-500">Loading…</p>
                ) : !statement ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                    <p className="text-sm text-slate-500">
                      Pick a customer and a date range to load a statement.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-6 text-sm">
                      <p>
                        Opening balance:{' '}
                        <span className="font-semibold text-navy-800">
                          {formatEtb(statement.openingBalance)}
                        </span>
                      </p>
                      <p>
                        Closing balance:{' '}
                        <span className="font-semibold text-navy-800">
                          {formatEtb(statement.closingBalance)}
                        </span>
                      </p>
                    </div>
                    {statement.rows.length === 0 ? (
                      <p className="py-6 text-sm text-slate-500">
                        No activity in this date range.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                              <th className="py-2 pr-4 font-semibold">Date</th>
                              <th className="py-2 pr-4 font-semibold">Type</th>
                              <th className="py-2 pr-4 font-semibold">Reference</th>
                              <th className="py-2 pr-4 text-right font-semibold">Debit</th>
                              <th className="py-2 pr-4 text-right font-semibold">Credit</th>
                              <th className="py-2 text-right font-semibold">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statement.rows.map((row) => (
                              <tr key={row.id} className="border-b border-slate-100 last:border-0">
                                <td className="py-3 pr-4 text-slate-600">{row.date}</td>
                                <td className="py-3 pr-4 text-slate-600">
                                  {STATEMENT_ROW_LABEL[row.kind]}
                                </td>
                                <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                                  {row.reference}
                                </td>
                                <td className="py-3 pr-4 text-right text-slate-600">
                                  {isZeroEtb(row.debit) ? '—' : formatEtb(row.debit)}
                                </td>
                                <td className="py-3 pr-4 text-right text-slate-600">
                                  {isZeroEtb(row.credit) ? '—' : formatEtb(row.credit)}
                                </td>
                                <td className="py-3 text-right font-semibold text-navy-800">
                                  {formatEtb(row.balance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
