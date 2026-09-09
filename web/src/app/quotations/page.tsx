'use client';

import Link from 'next/link';
import { updatedColumn } from '@/components/updated-column';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { Ban, Check, Pencil, X, XCircle } from 'lucide-react';

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
  cancelProforma,
  convertProformaToInvoice,
  convertQuotationToProforma,
  issueContractFromProforma,
  downloadProformaDocument,
  downloadQuotationDocument,
  downloadQuotationTechnicalProposal,
  printProformaDocument,
  printQuotationDocument,
  expireQuotation,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  listProjects,
  listQuotations,
  optional,
  rejectQuotation,
  submitQuotation,
  type DocumentFormat,
  type Quotation,
  type QuoteStatus,
  type UserRole,
} from '@/lib/api';

/** Approval issues the proforma, so the approved state reads as the proforma. */
const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CONVERTED_TO_PROFORMA: 'Proforma issued',
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

/**
 * Print stays its own button (it is the action people actually reach for);
 * the three file formats collapse into one control so a row is not seven
 * buttons wide. A native <select> on purpose: a CSS dropdown inside the
 * table's overflow container would be clipped on the last rows, and the
 * native picker is keyboard- and screen-reader-correct for free.
 */
/**
 * The quote row's Download… menu is not just formats of one document: the
 * technical proposal is its own PDF (no docx/xlsx renderer), so it rides in
 * the same control rather than adding a fifth button to the row.
 */
const QUOTE_DOWNLOADS = ['pdf', 'docx', 'xlsx', 'technical-proposal'] as const;
type QuoteDownload = (typeof QUOTE_DOWNLOADS)[number];

/**
 * Once the proforma exists the row carries two documents. One menu lists
 * both rather than two Print/Download pairs side by side — the row was
 * wider than the table.
 */
const ISSUED_DOWNLOADS = [
  'proforma:pdf',
  'proforma:docx',
  'proforma:xlsx',
  'pdf',
  'docx',
  'xlsx',
  'technical-proposal',
] as const;
type IssuedDownload = (typeof ISSUED_DOWNLOADS)[number];

/** Entries that are a document, not a format — the rest render as PDF/DOCX/XLSX. */
const DOWNLOAD_LABELS: Record<string, string> = {
  'technical-proposal': 'Technical proposal (PDF)',
  'proforma:pdf': 'Proforma (PDF)',
  'proforma:docx': 'Proforma (Word)',
  'proforma:xlsx': 'Proforma (Excel)',
  pdf: 'Quotation (PDF)',
  docx: 'Quotation (Word)',
  xlsx: 'Quotation (Excel)',
};

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
        {DOWNLOAD_LABELS[format] ?? format.toUpperCase()}
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
  role === 'SALES_MANAGER' ||
  role === 'SALESPERSON' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

/** Approval, conversion, contract issue and cancellation are the Sales
 *  Manager's ("quotation approval, pricing approval" in the requirement
 *  document); a Salesperson prepares and submits. */
const canApproveQuotes = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

/** Mirrors @Roles('FINANCE_OFFICER') on InvoicesController (class-level, no
 *  per-route override) — POST /proformas/:id/convert-to-invoice lives on
 *  that controller, not ProformasController, so it needs its own gate
 *  distinct from canWrite's SALES_MANAGER check above. */
const canConvertToInvoice = (role: UserRole | null): boolean =>
  role === 'FINANCE_OFFICER' || role === 'CEO' || role === 'GENERAL_MANAGER' || role === 'ADMIN';

export default function QuotationsPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);

  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteStatus | ''>('');

  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Proformas has no "converted" flag of its own (issueFromProforma never
  // touches proformas.status), so without this the → Invoice button would
  // stay live indefinitely and every second click would be a guaranteed 409
  // ("already been converted to an invoice"). Session-local only, same
  // limitation as invoices/page.tsx's reversedIds — a reload forgets it.
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());

  // Bulk selection. Cleared whenever the rows underneath it
  // change (see refresh) — an id whose row is no longer loaded cannot be
  // exported, so keeping it would silently drop it from the CSV.
  const [selectedQuotes, setSelectedQuotes] = useState<ReadonlySet<string>>(new Set());
  // Two-step confirm for Expire — the only destructive action here that has
  // no reason prompt of its own to act as the confirmation.
  const [confirmExpireId, setConfirmExpireId] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, qStatus: QuoteStatus | '', size: number) => {
      setLoading(true);
      setError(null);
      setSelectedQuotes(new Set());
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

        const result = await listQuotations({
          status: qStatus || undefined,
          page: nextPage,
          pageSize: size,
        });
        setQuotes(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
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
    void refresh(page, quoteStatusFilter, pageSize);
  }, [router, refresh, page, quoteStatusFilter, pageSize]);

  const setQuoteFilter = (next: QuoteStatus | '') => {
    setPage(1);
    setQuoteStatusFilter(next);
  };

  const runQuoteAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh(page, quoteStatusFilter, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onSubmitQuote = (quote: Quotation) => {
    void runQuoteAction(() => submitQuotation(quote.id), quote.id);
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

  /**
   * Approving IS issuing the proforma — one click, one transaction on the
   * API (POST /quotations/:id/convert-to-proforma accepts PENDING_APPROVAL).
   * ponytail: window.prompt for the optional valid-until date, matching the
   * established reason-prompt convention on this page.
   */
  const onApprove = (quote: Quotation) => {
    const entered = window.prompt(
      `Approve ${quote.quoteNumber} and issue its proforma. Proforma valid until (YYYY-MM-DD, optional)?`,
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

  const onCancelProforma = (quote: Quotation) => {
    if (!quote.proformaId) {
      return;
    }
    const entered = window.prompt(`Reason for cancelling ${quote.proformaNumber}?`);
    if (entered === null) {
      return;
    }
    const reason = entered.trim();
    if (reason.length < 2) {
      setError('Cancellation reason must be at least 2 characters');
      return;
    }
    const proformaId = quote.proformaId;
    void runQuoteAction(() => cancelProforma(proformaId, reason), quote.id);
  };

  // ponytail: window.prompt for the optional due date, matching the
  // established reason-prompt convention on this page (see onApprove above).
  const onConvertToInvoice = async (quote: Quotation) => {
    const proformaId = quote.proformaId;
    if (!proformaId) {
      return;
    }
    const entered = window.prompt(
      `Convert ${quote.proformaNumber} to an invoice. Due date (YYYY-MM-DD, optional)?`,
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
    setBusyId(quote.id);
    setError(null);
    try {
      await convertProformaToInvoice(proformaId, trimmed || undefined);
      setConvertedIds((prev) => new Set(prev).add(proformaId));
      await refresh(page, quoteStatusFilter, pageSize);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * The other half of an ISSUED proforma: the invoice bills it, the
   * contract is what the parties sign. One contract per proforma — the API
   * 409s on a second, so this is not gated on `convertedIds` (which only
   * tracks this session's invoice conversions).
   */
  const onIssueContract = async (quote: Quotation) => {
    if (!quote.proformaId) {
      return;
    }
    setBusyId(quote.id);
    setError(null);
    try {
      await issueContractFromProforma(quote.proformaId);
      router.push('/contracts');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDownloadQuote = async (quote: Quotation, choice: QuoteDownload) => {
    setBusyId(quote.id);
    setError(null);
    try {
      await (choice === 'technical-proposal'
        ? downloadQuotationTechnicalProposal(quote.id, quote.quoteNumber)
        : downloadQuotationDocument(quote.id, quote.quoteNumber, choice));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    } finally {
      setBusyId(null);
    }
  };

  const onDownloadIssued = (quote: Quotation, choice: IssuedDownload) =>
    choice.startsWith('proforma:')
      ? onDownloadProforma(quote, choice.slice('proforma:'.length) as DocumentFormat)
      : onDownloadQuote(quote, choice as QuoteDownload);

  const onDownloadProforma = async (quote: Quotation, format: DocumentFormat) => {
    if (!quote.proformaId || !quote.proformaNumber) {
      return;
    }
    setBusyId(quote.id);
    setError(null);
    try {
      await downloadProformaDocument(quote.proformaId, quote.proformaNumber, format);
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

  const onPrintProforma = async (quote: Quotation) => {
    if (!quote.proformaId) {
      return;
    }
    setBusyId(quote.id);
    setError(null);
    try {
      await printProformaDocument(quote.proformaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Print failed');
    } finally {
      setBusyId(null);
    }
  };

  const canMutate = canWrite(role);
  const canApprove = canApproveQuotes(role);
  const canInvoice = canConvertToInvoice(role);

  // Money goes out as the raw decimal string, not formatEtb's display form —
  // a spreadsheet has to be able to sum the column.
  const exportSelectedQuotes = () => {
    const rows = quotes.filter((quote) => selectedQuotes.has(quote.id));
    downloadCsv(
      'quotations.csv',
      ['Number', 'Proforma', 'Project', 'Customer', 'Status', 'Total ETB', 'Created'],
      rows.map((quote) => [
        quote.quoteNumber,
        quote.proformaNumber ?? '',
        projectMap[quote.projectId] ?? quote.projectId,
        customerMap[quote.customerId] ?? quote.customerId,
        QUOTE_STATUS_LABEL[quote.status],
        quote.totalPriceEtb,
        quote.createdAt.slice(0, 10),
      ]),
    );
  };

  const renderDocumentActions = <T extends string>(
    busy: boolean,
    onPick: (choice: T) => void,
    onPrint: () => void,
    label: string,
    formats: readonly T[],
  ) => (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={onPrint}
        title={`Print the ${label}`}
        className={`${btnSecondary} px-2.5 py-1 text-xs`}
      >
        Print
      </button>
      <DownloadSelect
        formats={formats}
        disabled={busy}
        onPick={onPick}
        label={label}
      />
    </>
  );

  const renderQuoteActions = (quote: Quotation) => {
    const busy = busyId === quote.id;
    const issued = quote.proformaStatus === 'ISSUED';
    return (
      <div className="flex items-center justify-end gap-1.5">
        {/* A quotation is built on its own screen — lifts, negotiated price
            and terms — and only a DRAFT can still be built. */}
        {canMutate && quote.status === 'DRAFT' ? (
          <RowAction
            icon={Pencil}
            disabled={busy}
            label={`Edit ${quote.quoteNumber}`}
            onClick={() => router.push(`/quotations/${quote.id}/edit`)}
          />
        ) : null}
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
        {canApprove && quote.status === 'PENDING_APPROVAL' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Approve
          </button>
        ) : null}
        {/* A legacy APPROVED row from before approval issued the proforma. */}
        {canApprove && quote.status === 'APPROVED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onApprove(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            Issue proforma
          </button>
        ) : null}
        {/* Once the proforma exists it is the document that moves on: the
            invoice bills it, the contract is what the parties sign. */}
        {canInvoice && issued && !convertedIds.has(quote.proformaId ?? '') ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConvertToInvoice(quote)}
            className={`${btnPrimary} px-2.5 py-1 text-xs`}
          >
            → Invoice
          </button>
        ) : null}
        {canApprove && issued ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onIssueContract(quote)}
            className={`${btnSecondary} px-2.5 py-1 text-xs`}
          >
            → Contract
          </button>
        ) : null}
        {/* Print gives the document the customer is owed at this stage: the
            proforma once issued, the quotation before. The menu has both. */}
        {quote.proformaId
          ? renderDocumentActions(
              busy,
              (choice) => void onDownloadIssued(quote, choice),
              () => void onPrintProforma(quote),
              `proforma ${quote.proformaNumber ?? ''}`,
              ISSUED_DOWNLOADS,
            )
          : renderDocumentActions(
              busy,
              (choice) => void onDownloadQuote(quote, choice),
              () => void onPrintQuote(quote),
              `quotation ${quote.quoteNumber}`,
              QUOTE_DOWNLOADS,
            )}
        {/* Destructive actions sit last, in the same place on every list.
            Reject already prompts for a mandatory reason, which IS its
            confirmation — a second confirm on top would just be a click to
            dismiss. Expire has no prompt, so it gets the two-step swap. */}
        {canApprove && quote.status === 'PENDING_APPROVAL' ? (
          <RowAction
            icon={XCircle}
            tone="danger"
            disabled={busy}
            label={`Reject ${quote.quoteNumber}`}
            onClick={() => onReject(quote)}
          />
        ) : null}
        {canApprove && (quote.status === 'DRAFT' || quote.status === 'PENDING_APPROVAL') ? (
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
        {/* Cancelling the proforma is the destructive move once it exists —
            a proforma is never deleted. Its reason prompt is the confirmation. */}
        {canApprove && issued ? (
          <RowAction
            icon={Ban}
            tone="danger"
            disabled={busy}
            label={`Cancel proforma ${quote.proformaNumber ?? ''}`}
            onClick={() => onCancelProforma(quote)}
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
        <div className="flex flex-col items-start gap-1">
          <StatusPill
            label={
              row.original.proformaStatus === 'CANCELLED'
                ? 'Proforma cancelled'
                : QUOTE_STATUS_LABEL[row.original.status]
            }
            tone={
              row.original.proformaStatus === 'CANCELLED'
                ? 'neutral'
                : QUOTE_STATUS_TONE[row.original.status]
            }
          />
          {row.original.proformaNumber ? (
            <span className="font-mono text-[11px] text-slate-500">
              {row.original.proformaNumber}
            </span>
          ) : null}
        </div>
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
    updatedColumn<Quotation>((row) => row.updatedAt),
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => renderQuoteActions(row.original),
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
                Draft → submit → approve. Approval issues the proforma (amounts in ETB)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/projects" className={btnGhost}>
                Project pipeline
              </Link>
              {canMutate ? (
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

          <section>
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
          </section>
        </main>
      </div>
    </div>
  );
}
