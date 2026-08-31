'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { btnGhost, btnPrimary, fieldClass, metaLabelClass } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { FilterSelect, ListToolbar, StatusPill } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
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
  type StatementRow,
  type StatementRowKind,
} from '@/lib/api';

type View = 'aging' | 'statement';

const STATEMENT_ROW_LABEL: Record<StatementRowKind, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  withholding: 'Withholding',
};

const STATEMENT_ROW_TONE: Record<StatementRowKind, 'neutral' | 'good' | 'warn'> = {
  invoice: 'neutral',
  payment: 'good',
  withholding: 'warn',
};

/** The money columns of the ageing report, in report order. One list drives
 *  both the table columns and the totals band so they can never disagree. */
type AgingMoneyKey = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'total';

const AGING_BUCKETS = [
  { key: 'current', label: 'Current' },
  { key: 'd1_30', label: '1-30' },
  { key: 'd31_60', label: '31-60' },
  { key: 'd61_90', label: '61-90' },
  { key: 'd90_plus', label: '90+' },
  { key: 'total', label: 'Total' },
] as const satisfies readonly { key: AgingMoneyKey; label: string }[];

const agingColumns: ColumnDef<AgingRow, unknown>[] = [
  {
    id: 'customer',
    header: 'Customer',
    enableSorting: true,
    accessorFn: (row) => row.customerName ?? row.customerId.slice(0, 8),
    cell: (cell) => <span className="font-medium text-slate-900">{cell.getValue<string>()}</span>,
  },
  ...AGING_BUCKETS.map<ColumnDef<AgingRow, unknown>>(({ key, label }) => ({
    id: key,
    header: label,
    meta: { align: 'right' },
    cell: ({ row }) =>
      key === 'total' ? (
        <span className="font-semibold text-navy-800">{formatEtb(row.original.total)}</span>
      ) : (
        formatEtb(row.original[key])
      ),
  })),
];

const statementColumns: ColumnDef<StatementRow, unknown>[] = [
  {
    id: 'date',
    header: 'Date',
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.date}</span>,
  },
  {
    id: 'kind',
    header: 'Type',
    cell: ({ row }) => (
      <StatusPill
        label={STATEMENT_ROW_LABEL[row.original.kind]}
        tone={STATEMENT_ROW_TONE[row.original.kind]}
      />
    ),
  },
  {
    id: 'reference',
    header: 'Reference',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-slate-900">{row.original.reference}</span>
    ),
  },
  {
    id: 'debit',
    header: 'Debit',
    meta: { align: 'right' },
    cell: ({ row }) => (isZeroEtb(row.original.debit) ? '—' : formatEtb(row.original.debit)),
  },
  {
    id: 'credit',
    header: 'Credit',
    meta: { align: 'right' },
    cell: ({ row }) => (isZeroEtb(row.original.credit) ? '—' : formatEtb(row.original.credit)),
  },
  {
    id: 'balance',
    header: 'Balance',
    meta: { align: 'right' },
    cell: ({ row }) => <span className="font-semibold text-navy-800">{formatEtb(row.original.balance)}</span>,
  },
];

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

/** Date field styled to sit level with a FilterSelect in the toolbar. */
const dateLabelClass = `mb-1 block font-semibold ${metaLabelClass}`;

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

  const agingTotals = AGING_BUCKETS.map(({ key, label }) => ({
    label,
    value: sumEtb(aging.map((row) => row[key])),
  }));

  const reportSelect = (
    <FilterSelect<'statement'>
      label="Report"
      value={view === 'statement' ? 'statement' : ''}
      onChange={(next) => switchView(next === 'statement' ? 'statement' : 'aging')}
      options={[{ value: 'statement', label: 'Customer statement' }]}
      allLabel="Ageing"
    />
  );

  const downloadButtons = (
    downloading: boolean,
    disabled: boolean,
    onDownload: (format: ReportFormat) => void,
  ) => (
    <div className="flex items-center gap-1">
      <span className={metaLabelClass}>Export</span>
      {REPORT_FORMATS.map((format) => (
        <button
          key={format}
          type="button"
          disabled={downloading || disabled}
          onClick={() => onDownload(format)}
          className={`${btnGhost} px-2 py-1 text-xs uppercase`}
        >
          {format}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Money"
          title="Receivables"
          description="What every customer owes, by age, and the statement behind it. Read-only — money moves on Invoices."
          actions={
            <Link href="/invoices" className={btnGhost}>
              Invoices
            </Link>
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8 print:bg-white print:p-0">
          {view === 'aging' ? (
            <>
              {agingError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {agingError}
                </p>
              ) : null}

              <ListToolbar
                filters={reportSelect}
                actions={downloadButtons(agingDownloading, aging.length === 0, (format) =>
                  void onDownloadAging(format),
                )}
              />

              <p className="mb-4 text-xs text-slate-500 print:hidden">
                Per-invoice outstanding by customer, as of today. Excludes unapplied cash — see a
                customer&apos;s own net balance for that.
              </p>

              {aging.length > 0 ? (
                <dl className="mb-4 flex flex-wrap gap-x-10 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  {agingTotals.map(({ label, value }) => (
                    <div key={label}>
                      <dt className={metaLabelClass}>{label}</dt>
                      <dd className="font-display text-base font-semibold tabular-nums text-slate-900">
                        {formatEtb(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              <DataTable
                caption="Receivables ageing"
                columns={agingColumns}
                rows={aging}
                getRowId={(row) => row.customerId}
                loading={agingLoading}
                empty={
                  <>
                    No customer has an outstanding balance. Anything unpaid appears here the moment
                    an invoice on Invoices passes its due date.
                  </>
                }
              />
            </>
          ) : (
            <>
              {statementError ? (
                <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {statementError}
                </p>
              ) : null}

              <form onSubmit={onSubmitStatement}>
                <ListToolbar
                  filters={
                    <>
                      {reportSelect}
                      <FilterSelect
                        label="Customer"
                        value={statementCustomerId}
                        onChange={setStatementCustomerId}
                        options={customers.map((c) => ({ value: c.id, label: c.name }))}
                        allLabel="Select a customer"
                      />
                      <div>
                        <label className={dateLabelClass} htmlFor="stmt-from">
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
                        <label className={dateLabelClass} htmlFor="stmt-to">
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
                      <button type="submit" className={btnPrimary} disabled={!statementCustomerId}>
                        Load
                      </button>
                    </>
                  }
                  actions={downloadButtons(statementDownloading, !statement, (format) =>
                    void onDownloadStatement(format),
                  )}
                />
              </form>

              {statement ? (
                <div className="mb-4 flex flex-wrap gap-10 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div>
                    <p className={metaLabelClass}>Opening balance</p>
                    <p className="font-display text-xl font-semibold tabular-nums text-slate-900">
                      {formatEtb(statement.openingBalance)}
                    </p>
                  </div>
                  <div>
                    <p className={metaLabelClass}>Closing balance</p>
                    <p className="font-display text-2xl font-semibold tabular-nums text-slate-900">
                      {formatEtb(statement.closingBalance)}
                    </p>
                  </div>
                </div>
              ) : null}

              <DataTable
                caption={
                  statement ? `Statement — ${statement.customerName}` : 'Customer statement'
                }
                columns={statementColumns}
                rows={statement?.rows ?? []}
                getRowId={(row) => row.id}
                loading={statementLoading}
                empty={
                  statement ? (
                    <>
                      No invoices or payments for this customer in that range. Widen the dates and
                      load again.
                    </>
                  ) : (
                    <>Pick a customer and a date range above, then choose Load to build the statement.</>
                  )
                }
              />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
