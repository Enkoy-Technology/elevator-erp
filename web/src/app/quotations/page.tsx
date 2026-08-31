'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { Ban, Check, X, XCircle } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import {
  FilterSelect,
  ListToolbar,
  RowAction,
  StatusPill,
} from '@/components/list-toolbar';
import { Sidebar } from '@/components/sidebar';
import { formatEtb } from '@/lib/money';
import {
  ApiError,
  approveQuotation,
  cancelProforma,
  convertProformaToInvoice,
  convertQuotationToProforma,
  downloadProformaDocument,
  downloadQuotationDocument,
  printProformaDocument,
  printQuotationDocument,
  expireQuotation,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  listProformas,
  listProjects,
  listQuotations,
  optional,
  rejectQuotation,
  submitQuotation,
  type DocumentFormat,
  type Proforma,
  type ProformaStatus,
  type Quotation,
  type QuoteStatus,
  type UserRole,
} from '@/lib/api';

type Tab = 'quotations' | 'proformas';

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CONVERTED_TO_PROFORMA: 'Converted',
};

/** One tone vocabulary for the whole ERP — StatusPill owns the colours. */
const QUOTE_STATUS_TONE = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warn',
  APPROVED: 'good',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  CONVERTED_TO_PROFORMA: 'active',
} as const satisfies Record<QuoteStatus, string>;

const QUOTE_FILTERS: readonly QuoteStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED_TO_PROFORMA',
];

const PROFORMA_STATUS_LABEL: Record<ProformaStatus, string> = {
  ISSUED: 'Issued',
  CANCELLED: 'Cancelled',
};

const PROFORMA_STATUS_TONE = {
  ISSUED: 'good',
  CANCELLED: 'neutral',
} as const satisfies Record<ProformaStatus, string>;

const PROFORMA_FILTERS: readonly ProformaStatus[] = ['ISSUED', 'CANCELLED'];

/**
 * Print stays its own button (it is the action people actually reach for);
 * the three file formats collapse into one control so a row is not seven
 * buttons wide. A native <select> on purpose: a CSS dropdown inside the
 * table's overflow container would be clipped on the last rows, and the
 * native picker is keyboard- and screen-reader-correct for free.
 */
const DownloadSelect = <T extends string>({
  formats,
  disabled,
  onPick,
  label,
}: {
  formats: readonly T[];
  disabled: boolean;
  onPick: (format: T) => void;
  label: string;
}) => (
  <select
    aria-label={label}
    disabled={disabled}
    value=""
    onChange={(event) => {
      const format = event.target.value;
      if (format) {
        onPick(format as T);
      }
    }}
    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
  >
    <option value="">Download…</option>
    {formats.map((format) => (
      <option key={format} value={format}>
        {format.toUpperCase()}
      </option>
    ))}
  </select>
);

/**
 * "Export selected" — a CSV of exactly the rows that are ticked, built from
 * the page's already-loaded data. There is no "give me these ids" endpoint,
 * and re-fetching rows the browser is already holding to produce them would
 * be work for nothing.
 *
 * ponytail: duplicated in the other list pages rather than lifted into
 * @/lib/csv, because those files are being edited concurrently. Lift it into
 * one module once they have landed.
 */
const downloadCsv = (
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void => {
  // Quote every cell, and neutralise a leading =/+/-/@ so that a crafted
  // value (a customer name, a rejection reason) opens as text in a
  // spreadsheet rather than as a formula.
  const cell = (value: string): string =>
    `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // BOM: Excel needs it to read UTF-8 (Amharic names) instead of mojibake.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Mirrors @Roles('SALES_MANAGER') on the quotations/proformas mutation
 *  routes; CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWrite = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

/** Mirrors @Roles('FINANCE') on InvoicesController (class-level, no
 *  per-route override) — POST /proformas/:id/convert-to-invoice lives on
 *  that controller, not ProformasController, so it needs its own gate
 *  distinct from canWrite's SALES_MANAGER check above. */
const canConvertToInvoice = (role: UserRole | null): boolean =>
  role === 'FINANCE' || role === 'CEO' || role === 'ADMIN';

export default function QuotationsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('quotations');
  const [role, setRole] = useState<UserRole | null>(null);

  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteStatus | ''>('');
  const [proformaStatusFilter, setProformaStatusFilter] = useState<ProformaStatus | ''>('');

  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [quoteNumberMap, setQuoteNumberMap] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Proformas has no "converted" flag of its own (issueFromProforma never
  // touches proformas.status), so without this the → Invoice button would
  // stay live indefinitely and every second click would be a guaranteed 409
  // ("already been converted to an invoice"). Session-local only, same
  // limitation as invoices/page.tsx's reversedIds — a reload forgets it.
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());

  // Bulk selection, one set per tab. Cleared whenever the rows underneath it
  // change (see refresh) — an id whose row is no longer loaded cannot be
  // exported, so keeping it would silently drop it from the CSV.
  const [selectedQuotes, setSelectedQuotes] = useState<ReadonlySet<string>>(new Set());
  const [selectedProformas, setSelectedProformas] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // Two-step confirm for Expire — the only destructive action here that has
  // no reason prompt of its own to act as the confirmation.
  const [confirmExpireId, setConfirmExpireId] = useState<string | null>(null);

  const refresh = useCallback(
    async (
      nextTab: Tab,
      nextPage: number,
      qStatus: QuoteStatus | '',
      pStatus: ProformaStatus | '',
      size: number,
    ) => {
      setLoading(true);
      setError(null);
      setSelectedQuotes(new Set());
      setSelectedProformas(new Set());
      setConfirmExpireId(null);
      try {
        const [projectPage, customerPage] = await Promise.all([
          optional(listProjects({ page: 1, pageSize: 100 })),
          optional(listCustomers({ page: 1, pageSize: 100 })),
        ]);
        setProjectMap(
          Object.fromEntries(projectPage.items.map((p) => [p.id, p.name] as const)),
        );
        setCustomerMap(
          Object.fromEntries(customerPage.items.map((c) => [c.id, c.name] as const)),
        );

        if (nextTab === 'quotations') {
          const result = await listQuotations({
            status: qStatus || undefined,
            page: nextPage,
            pageSize: size,
          });
          setQuotes(result.items);
          setPage(result.page);
          setTotal(result.total);
          setTotalPages(result.totalPages);
        } else {
          const [result, quotePage] = await Promise.all([
            listProformas({
              status: pStatus || undefined,
              page: nextPage,
              pageSize: size,
            }),
            optional(listQuotations({ page: 1, pageSize: 100 })),
          ]);
          setProformas(result.items);
          setPage(result.page);
          setTotal(result.total);
          setTotalPages(result.totalPages);
          setQuoteNumberMap(
            Object.fromEntries(quotePage.items.map((q) => [q.id, q.quoteNumber] as const)),
          );
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
    void refresh(tab, page, quoteStatusFilter, proformaStatusFilter, pageSize);
  }, [router, refresh, tab, page, quoteStatusFilter, proformaStatusFilter, pageSize]);

  const switchTab = (next: Tab) => {
    setPage(1);
    setError(null);
    setTab(next);
  };

  const setQuoteFilter = (next: QuoteStatus | '') => {
    setPage(1);
    setQuoteStatusFilter(next);
  };

  const setProformaFilter = (next: ProformaStatus | '') => {
    setPage(1);
    setProformaStatusFilter(next);
  };

  const runQuoteAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh('quotations', page, quoteStatusFilter, proformaStatusFilter, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const runProformaAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh('proformas', page, quoteStatusFilter, proformaStatusFilter, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSubmitQuote = (quote: Quotation) => {
    void runQuoteAction(() => submitQuotation(quote.id), quote.id);
  };

  const onApprove = (quote: Quotation) => {
    void runQuoteAction(() => approveQuotation(quote.id), quote.id);
  };

  const onReject = (quote: Quotation) => {
    const entered = window.prompt(`Reason for rejecting ${quote.quoteNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Rejection reason must be at least 2 characters');
      return;
    }
    void runQuoteAction(() => rejectQuotation(quote.id, reason), quote.id);
  };

  const onExpire = (quote: Quotation) => {
    void runQuoteAction(() => expireQuotation(quote.id), quote.id);
  };

  // ponytail: window.prompt for the optional valid-until date, matching the
  // established reason-prompt convention on this page and in
  // projects/page.tsx — swap for a drawer field if reps find it clumsy.
  const onConvert = (quote: Quotation) => {
    const entered = window.prompt(
      `Convert ${quote.quoteNumber} to a proforma. Valid until (YYYY-MM-DD, optional)?`,
      '',
    );
    if (entered === null) {
      return;
    }
    const trimmed = entered.trim();
    if (trimmed && !ISO_DATE.test(trimmed)) {
      setError('Valid-until date must be in YYYY-MM-DD format');
      return;
    }
    void runQuoteAction(
      () => convertQuotationToProforma(quote.id, trimmed || undefined),
      quote.id,
    );
  };

  const onCancelProforma = (proforma: Proforma) => {
    const entered = window.prompt(`Reason for cancelling ${proforma.proformaNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Cancellation reason must be at least 2 characters');
      return;
    }
    void runProformaAction(() => cancelProforma(proforma.id, reason), proforma.id);
  };

  // ponytail: window.prompt for the optional due date, matching the
  // established reason-prompt convention on this page (see onConvert above).
  const onConvertToInvoice = async (proforma: Proforma) => {
    const entered = window.prompt(
      `Convert ${proforma.proformaNumber} to an invoice. Due date (YYYY-MM-DD, optional)?`,
      '',
    );
    if (entered === null) {
      return;
    }
    const trimmed = entered.trim();
    if (trimmed && !ISO_DATE.test(trimmed)) {
      setError('Due date must be in YYYY-MM-DD format');
      return;
    }
    setBusyId(proforma.id);
    setError(null);
    try {
      await convertProformaToInvoice(proforma.id, trimmed || undefined);
      setConvertedIds((prev) => new Set(prev).add(proforma.id));
      await refresh('proformas', page, quoteStatusFilter, proformaStatusFilter, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDownloadQuote = async (quote: Quotation, format: DocumentFormat) => {
    setBusyId(quote.id);
    setError(null);
    try {
      await downloadQuotationDocument(quote.id, quote.quoteNumber, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDownloadProforma = async (proforma: Proforma, format: DocumentFormat) => {
    setBusyId(proforma.id);
    setError(null);
    try {
      await downloadProformaDocument(proforma.id, proforma.proformaNumber, format);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onPrintQuote = async (quote: Quotation) => {
    setBusyId(quote.id);
    setError(null);
    try {
      await printQuotationDocument(quote.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  const onPrintProforma = async (proforma: Proforma) => {
    setBusyId(proforma.id);
    setError(null);
    try {
      await printProformaDocument(proforma.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  const canMutate = canWrite(role);
  const canInvoice = canConvertToInvoice(role);

  // Money goes out as the raw decimal string, not formatEtb's display form —
  // a spreadsheet has to be able to sum the column.
  const exportSelectedQuotes = () => {
    const rows = quotes.filter((quote) => selectedQuotes.has(quote.id));
    downloadCsv(
      'quotations.csv',
      ['Number', 'Project', 'Customer', 'Status', 'Total ETB', 'Created'],
      rows.map((quote) => [
        quote.quoteNumber,
        projectMap[quote.projectId] ?? quote.projectId,
        customerMap[quote.customerId] ?? quote.customerId,
        QUOTE_STATUS_LABEL[quote.status],
        quote.totalPriceEtb,
        quote.createdAt.slice(0, 10),
      ]),
    );
  };

  const exportSelectedProformas = () => {
    const rows = proformas.filter((proforma) => selectedProformas.has(proforma.id));
    downloadCsv(
      'proformas.csv',
      ['Number', 'Quotation', 'Customer', 'Subtotal ETB', 'VAT ETB', 'Total ETB', 'Issued', 'Status'],
      rows.map((proforma) => [
        proforma.proformaNumber,
        quoteNumberMap[proforma.quotationId] ?? proforma.quotationId,
        customerMap[proforma.customerId] ?? proforma.customerId,
        proforma.subtotalEtb,
        proforma.vatEtb,
        proforma.totalEtb,
        proforma.issuedAt.slice(0, 10),
        PROFORMA_STATUS_LABEL[proforma.status],
      ]),
    );
  };

  const renderDocumentActions = (
    busy: boolean,
    onPick: (format: DocumentFormat) => void,
    onPrint: () => void,
    label: string,
  ) => (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={onPrint}
        title="Print the PDF"
        className={`${btnSecondary} px-2.5 py-1 text-xs`}
      >
        Print
      </button>
      <DownloadSelect
        formats={['pdf', 'docx', 'xlsx'] as const}
        disabled={busy}
        onPick={onPick}
        label={label}
      />
    </>
  );

  const renderQuoteActions = (quote: Quotation) => {
    const busy = busyId === quote.id;
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canMutate && quote.status === 'DRAFT' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmitQuote(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Submit
          </button>
        ) : null}
        {canMutate && quote.status === 'PENDING_APPROVAL' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Approve
          </button>
        ) : null}
        {canMutate && quote.status === 'APPROVED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConvert(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            → Proforma
          </button>
        ) : null}
        {renderDocumentActions(
          busy,
          (format) => void onDownloadQuote(quote, format),
          () => void onPrintQuote(quote),
          `Download ${quote.quoteNumber}`,
        )}
        {/* Destructive actions sit last, in the same place on every list.
            Reject already prompts for a mandatory reason, which IS its
            confirmation — a second confirm on top would just be a click to
            dismiss. Expire has no prompt, so it gets the two-step swap. */}
        {canMutate && quote.status === 'PENDING_APPROVAL' ? (
          <RowAction
            icon={XCircle}
            tone="danger"
            disabled={busy}
            label={`Reject ${quote.quoteNumber}`}
            onClick={() => onReject(quote)}
          />
        ) : null}
        {canMutate && (quote.status === 'DRAFT' || quote.status === 'PENDING_APPROVAL') ? (
          confirmExpireId === quote.id ? (
            <>
              <RowAction
                icon={Check}
                tone="danger"
                disabled={busy}
                label={`Confirm expiring ${quote.quoteNumber}`}
                onClick={() => {
                  setConfirmExpireId(null);
                  onExpire(quote);
                }}
              />
              <RowAction
                icon={X}
                disabled={busy}
                label={`Keep ${quote.quoteNumber} open`}
                onClick={() => setConfirmExpireId(null)}
              />
            </>
          ) : (
            <RowAction
              icon={Ban}
              tone="danger"
              disabled={busy}
              label={`Expire ${quote.quoteNumber}`}
              onClick={() => setConfirmExpireId(quote.id)}
            />
          )
        ) : null}
      </div>
    );
  };

  const renderProformaActions = (proforma: Proforma) => {
    const busy = busyId === proforma.id;
    return (
      <div className="flex items-center justify-end gap-1.5">
        {canInvoice && proforma.status === 'ISSUED' && !convertedIds.has(proforma.id) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConvertToInvoice(proforma)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            → Invoice
          </button>
        ) : null}
        {renderDocumentActions(
          busy,
          (format) => void onDownloadProforma(proforma, format),
          () => void onPrintProforma(proforma),
          `Download ${proforma.proformaNumber}`,
        )}
        {/* Cancel is a proforma's destructive equivalent — a proforma is
            never deleted. Its reason prompt is the confirmation step. */}
        {canMutate && proforma.status === 'ISSUED' ? (
          <RowAction
            icon={Ban}
            tone="danger"
            disabled={busy}
            label={`Cancel ${proforma.proformaNumber}`}
            onClick={() => onCancelProforma(proforma)}
          />
        ) : null}
      </div>
    );
  };

  const quoteColumns: ColumnDef<Quotation, unknown>[] = [
    {
      accessorKey: 'quoteNumber',
      header: 'Number',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-900">{row.original.quoteNumber}</span>
      ),
    },
    {
      id: 'project',
      header: 'Project',
      accessorFn: (row) => projectMap[row.projectId] ?? row.projectId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'customer',
      header: 'Customer',
      enableSorting: true,
      accessorFn: (row) => customerMap[row.customerId] ?? row.customerId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={QUOTE_STATUS_LABEL[row.original.status]}
          tone={QUOTE_STATUS_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-semibold text-navy-800">{formatEtb(row.original.totalPriceEtb)}</span>
      ),
    },
    {
      id: 'created',
      header: 'Created',
      cell: ({ row }) => row.original.createdAt.slice(0, 10),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderQuoteActions(row.original),
    },
  ];

  const proformaColumns: ColumnDef<Proforma, unknown>[] = [
    {
      accessorKey: 'proformaNumber',
      header: 'Number',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-900">{row.original.proformaNumber}</span>
      ),
    },
    {
      id: 'quotation',
      header: 'Quotation',
      accessorFn: (row) => quoteNumberMap[row.quotationId] ?? row.quotationId.slice(0, 8),
      cell: (cell) => <span className="font-mono text-xs">{cell.getValue<string>()}</span>,
    },
    {
      id: 'customer',
      header: 'Customer',
      enableSorting: true,
      accessorFn: (row) => customerMap[row.customerId] ?? row.customerId.slice(0, 8),
      cell: (cell) => cell.getValue<string>(),
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="font-semibold text-navy-800">{formatEtb(row.original.totalEtb)}</span>
      ),
    },
    {
      id: 'issued',
      header: 'Issued',
      cell: ({ row }) => row.original.issuedAt.slice(0, 10),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={PROFORMA_STATUS_LABEL[row.original.status]}
          tone={PROFORMA_STATUS_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderProformaActions(row.original),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Quotations</h1>
              <p className="text-sm text-slate-500">
                Draft → approve → issue a proforma (amounts in ETB)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/projects" className={btnGhost}>
                Project pipeline
              </Link>
              {tab === 'quotations' && canMutate ? (
                <Link href="/quotations/new" className={btnPrimary}>
                  Create quote
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => switchTab('quotations')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'quotations'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Quotations
            </button>
            <button
              type="button"
              onClick={() => switchTab('proformas')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'proformas'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Proformas
            </button>
          </div>

          <section>
            {tab === 'quotations' ? (
              <>
                <ListToolbar
                  filters={
                    <FilterSelect
                      label="Status"
                      value={quoteStatusFilter}
                      onChange={setQuoteFilter}
                      options={QUOTE_FILTERS.map((s) => ({
                        value: s,
                        label: QUOTE_STATUS_LABEL[s],
                      }))}
                      allLabel="All statuses"
                    />
                  }
                />
                <DataTable
                  columns={quoteColumns}
                  rows={quotes}
                  getRowId={(quote) => quote.id}
                  getRowLabel={(quote) => quote.quoteNumber}
                  selectable
                  selectedIds={selectedQuotes}
                  onSelectionChange={setSelectedQuotes}
                  bulkActions={
                    <button
                      type="button"
                      onClick={exportSelectedQuotes}
                      className={`${btnSecondary} px-2.5 py-1 text-xs`}
                    >
                      Export selected
                    </button>
                  }
                  loading={loading}
                  caption="Quotations"
                  pagination={{
                    page,
                    pageSize,
                    total,
                    totalPages,
                    onPageChange: setPage,
                    onPageSizeChange: (size) => {
                      setPageSize(size);
                      setPage(1);
                    },
                  }}
                  empty={
                    canMutate ? (
                      <>
                        No quotations yet.{' '}
                        <Link
                          href="/quotations/new"
                          className="font-semibold text-navy-800 hover:underline"
                        >
                          Draft your first quote
                        </Link>
                        .
                      </>
                    ) : (
                      <>No quotations yet. A sales manager drafts the first one.</>
                    )
                  }
                />
              </>
            ) : (
              <>
                <ListToolbar
                  filters={
                    <FilterSelect
                      label="Status"
                      value={proformaStatusFilter}
                      onChange={setProformaFilter}
                      options={PROFORMA_FILTERS.map((s) => ({
                        value: s,
                        label: PROFORMA_STATUS_LABEL[s],
                      }))}
                      allLabel="All statuses"
                    />
                  }
                />
                <DataTable
                  columns={proformaColumns}
                  rows={proformas}
                  getRowId={(proforma) => proforma.id}
                  getRowLabel={(proforma) => proforma.proformaNumber}
                  selectable
                  selectedIds={selectedProformas}
                  onSelectionChange={setSelectedProformas}
                  bulkActions={
                    <button
                      type="button"
                      onClick={exportSelectedProformas}
                      className={`${btnSecondary} px-2.5 py-1 text-xs`}
                    >
                      Export selected
                    </button>
                  }
                  loading={loading}
                  caption="Proformas"
                  pagination={{
                    page,
                    pageSize,
                    total,
                    totalPages,
                    onPageChange: setPage,
                    onPageSizeChange: (size) => {
                      setPageSize(size);
                      setPage(1);
                    },
                  }}
                  empty={<>No proformas yet. Approve a quotation, then convert it to a proforma.</>}
                />
              </>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
