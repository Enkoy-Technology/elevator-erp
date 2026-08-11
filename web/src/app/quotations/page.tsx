'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  btnDanger,
  btnGhost,
  btnPrimary,
  btnSecondary,
  fieldClass,
  labelClass,
} from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import { formatEtb } from '@/lib/money';
import {
  ApiError,
  approveQuotation,
  cancelProforma,
  convertProformaToInvoice,
  convertQuotationToProforma,
  createQuotationFromCalc,
  downloadProformaDocument,
  downloadQuotationDocument,
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
  type CreateQuotationPayload,
  type DocumentFormat,
  type Project,
  type Proforma,
  type ProformaStatus,
  type Quotation,
  type QuoteStatus,
  type UserRole,
} from '@/lib/api';

const PAGE_SIZE = 20;

type Tab = 'quotations' | 'proformas';

const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
  CONVERTED_TO_PROFORMA: 'Converted',
};

const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-slate-200 text-slate-500',
  CONVERTED_TO_PROFORMA: 'bg-sky-100 text-sky-700',
};

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

const PROFORMA_STATUS_BADGE: Record<ProformaStatus, string> = {
  ISSUED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-slate-200 text-slate-500',
};

const PROFORMA_FILTERS: readonly ProformaStatus[] = ['ISSUED', 'CANCELLED'];

const CALC_DEFAULTS: Omit<CreateQuotationPayload, 'validUntil' | 'notes'> = {
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
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
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<QuoteStatus | ''>('');
  const [proformaStatusFilter, setProformaStatusFilter] = useState<ProformaStatus | ''>('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [quoteNumberMap, setQuoteNumberMap] = useState<Record<string, string>>({});

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [calc, setCalc] = useState(CALC_DEFAULTS);
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Proformas has no "converted" flag of its own (issueFromProforma never
  // touches proformas.status), so without this the → Invoice button would
  // stay live indefinitely and every second click would be a guaranteed 409
  // ("already been converted to an invoice"). Session-local only, same
  // limitation as invoices/page.tsx's reversedIds — a reload forgets it.
  const [convertedIds, setConvertedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(
    async (
      nextTab: Tab,
      nextPage: number,
      qStatus: QuoteStatus | '',
      pStatus: ProformaStatus | '',
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [projectPage, customerPage] = await Promise.all([
          optional(listProjects({ page: 1, pageSize: 100 })),
          optional(listCustomers({ page: 1, pageSize: 100 })),
        ]);
        setProjects(projectPage.items);
        setProjectMap(
          Object.fromEntries(projectPage.items.map((p) => [p.id, p.name] as const)),
        );
        setCustomerMap(
          Object.fromEntries(customerPage.items.map((c) => [c.id, c.name] as const)),
        );
        setProjectId((prev) => prev || projectPage.items[0]?.id || '');

        if (nextTab === 'quotations') {
          const result = await listQuotations({
            status: qStatus || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
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
              pageSize: PAGE_SIZE,
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
    void refresh(tab, page, quoteStatusFilter, proformaStatusFilter);
  }, [router, refresh, tab, page, quoteStatusFilter, proformaStatusFilter]);

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

  const openDrawer = () => {
    setCalc(CALC_DEFAULTS);
    setValidUntil('');
    setNotes('');
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const setCalcField = (field: keyof typeof CALC_DEFAULTS, value: string) => {
    setCalc((prev) => ({
      ...prev,
      [field]: typeof CALC_DEFAULTS[field] === 'number' ? Number(value) : value,
    }));
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      setFormError('Create a project first, then draft a quote.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createQuotationFromCalc(projectId, {
        ...calc,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        notes: notes || undefined,
      });
      closeDrawer();
      setPage(1);
      setQuoteStatusFilter('');
      await refresh('quotations', 1, '', proformaStatusFilter);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create quotation',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const runQuoteAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh('quotations', page, quoteStatusFilter, proformaStatusFilter);
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
      await refresh('proformas', page, quoteStatusFilter, proformaStatusFilter);
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
      await refresh('proformas', page, quoteStatusFilter, proformaStatusFilter);
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

  const canMutate = canWrite(role);
  const canInvoice = canConvertToInvoice(role);

  const renderDownloadMenu = (busy: boolean, onPick: (format: DocumentFormat) => void) => (
    <div className="flex items-center gap-1">
      {(['pdf', 'docx', 'xlsx'] as const).map((format) => (
        <button
          key={format}
          type="button"
          disabled={busy}
          onClick={() => onPick(format)}
          className={`${btnGhost} px-2 py-1 text-xs uppercase`}
        >
          {format}
        </button>
      ))}
    </div>
  );

  const renderQuoteActions = (quote: Quotation) => {
    const busy = busyId === quote.id;
    return (
      <div className="flex flex-wrap items-center gap-2">
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
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApprove(quote)}
              className={`${btnPrimary} px-2.5 py-1 text-xs`}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject(quote)}
              className={`${btnDanger} px-2.5 py-1 text-xs`}
            >
              Reject
            </button>
          </>
        ) : null}
        {canMutate && (quote.status === 'DRAFT' || quote.status === 'PENDING_APPROVAL') ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onExpire(quote)}
            className={`${btnSecondary} px-2.5 py-1 text-xs`}
          >
            Expire
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
        {renderDownloadMenu(busy, (format) => void onDownloadQuote(quote, format))}
      </div>
    );
  };

  const renderProformaActions = (proforma: Proforma) => {
    const busy = busyId === proforma.id;
    return (
      <div className="flex flex-wrap items-center gap-2">
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
        {canMutate && proforma.status === 'ISSUED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancelProforma(proforma)}
            className={`${btnDanger} px-2.5 py-1 text-xs`}
          >
            Cancel
          </button>
        ) : null}
        {renderDownloadMenu(busy, (format) => void onDownloadProforma(proforma, format))}
      </div>
    );
  };

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
                <button type="button" onClick={openDrawer} className={btnPrimary}>
                  Create quote
                </button>
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

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {tab === 'quotations' ? (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Filter
                </span>
                <button
                  type="button"
                  onClick={() => setQuoteFilter('')}
                  className={
                    quoteStatusFilter === ''
                      ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                  }
                >
                  All
                </button>
                {QUOTE_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuoteFilter(s)}
                    className={
                      quoteStatusFilter === s
                        ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                        : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                    }
                  >
                    {QUOTE_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Filter
                </span>
                <button
                  type="button"
                  onClick={() => setProformaFilter('')}
                  className={
                    proformaStatusFilter === ''
                      ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                  }
                >
                  All
                </button>
                {PROFORMA_FILTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setProformaFilter(s)}
                    className={
                      proformaStatusFilter === s
                        ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                        : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                    }
                  >
                    {PROFORMA_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : tab === 'quotations' ? (
              quotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                  <p className="text-sm text-slate-500">No quotations yet.</p>
                  {canMutate ? (
                    <button
                      type="button"
                      onClick={openDrawer}
                      className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                    >
                      Draft your first quote
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-4 font-semibold">Number</th>
                          <th className="py-2 pr-4 font-semibold">Project</th>
                          <th className="py-2 pr-4 font-semibold">Customer</th>
                          <th className="py-2 pr-4 font-semibold">Status</th>
                          <th className="py-2 pr-4 font-semibold">Total (ETB)</th>
                          <th className="py-2 pr-4 font-semibold">Created</th>
                          <th className="py-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.map((q) => (
                          <tr key={q.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                              {q.quoteNumber}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {projectMap[q.projectId] ?? q.projectId.slice(0, 8)}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {customerMap[q.customerId] ?? q.customerId.slice(0, 8)}
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${QUOTE_STATUS_BADGE[q.status]}`}
                              >
                                {QUOTE_STATUS_LABEL[q.status]}
                              </span>
                            </td>
                            <td className="py-3 pr-4 font-semibold text-navy-800">
                              {formatEtb(q.totalPriceEtb)}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {q.createdAt.slice(0, 10)}
                            </td>
                            <td className="py-3">{renderQuoteActions(q)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={total}
                    totalPages={totalPages}
                    onPageChange={setPage}
                  />
                </>
              )
            ) : proformas.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No proformas yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Number</th>
                        <th className="py-2 pr-4 font-semibold">Quotation</th>
                        <th className="py-2 pr-4 font-semibold">Customer</th>
                        <th className="py-2 pr-4 font-semibold">Total (ETB)</th>
                        <th className="py-2 pr-4 font-semibold">Issued</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proformas.map((p) => (
                        <tr key={p.id} className="border-b border-slate-100 last:border-0">
                          <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                            {p.proformaNumber}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {quoteNumberMap[p.quotationId] ?? p.quotationId.slice(0, 8)}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {customerMap[p.customerId] ?? p.customerId.slice(0, 8)}
                          </td>
                          <td className="py-3 pr-4 font-semibold text-navy-800">
                            {formatEtb(p.totalEtb)}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {p.issuedAt.slice(0, 10)}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROFORMA_STATUS_BADGE[p.status]}`}
                            >
                              {PROFORMA_STATUS_LABEL[p.status]}
                            </span>
                          </td>
                          <td className="py-3">{renderProformaActions(p)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </>
            )}
          </section>
        </main>
      </div>

      <SideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Create quotation"
        description="Prices the elevator spec server-side (VAT from the statutory rate table) and saves a DRAFT."
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={closeDrawer} className={`${btnSecondary} flex-1`}>
              Cancel
            </button>
            <button
              type="submit"
              form="create-quote-form"
              disabled={submitting || projects.length === 0}
              className={`${btnPrimary} flex-1`}
            >
              {submitting ? 'Pricing…' : 'Save draft'}
            </button>
          </div>
        }
      >
        <form
          id="create-quote-form"
          onSubmit={(e) => void onCreate(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="project">
              Project
            </label>
            <select
              id="project"
              className={fieldClass}
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {projects.length === 0 ? (
                <option value="">No projects yet</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="capacityKg">
                Capacity (kg)
              </label>
              <input
                id="capacityKg"
                type="number"
                className={fieldClass}
                value={calc.capacityKg}
                onChange={(e) => setCalcField('capacityKg', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="stops">
                Stops
              </label>
              <input
                id="stops"
                type="number"
                className={fieldClass}
                value={calc.stops}
                onChange={(e) => setCalcField('stops', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="travelHeightM">
                Travel height (m)
              </label>
              <input
                id="travelHeightM"
                type="number"
                step="0.01"
                className={fieldClass}
                value={calc.travelHeightM}
                onChange={(e) => setCalcField('travelHeightM', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="speedMs">
                Speed (m/s)
              </label>
              <input
                id="speedMs"
                type="number"
                step="0.01"
                className={fieldClass}
                value={calc.speedMs}
                onChange={(e) => setCalcField('speedMs', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="machineRoomType">
                Machine room
              </label>
              <select
                id="machineRoomType"
                className={fieldClass}
                value={calc.machineRoomType}
                onChange={(e) => setCalcField('machineRoomType', e.target.value)}
              >
                <option value="MRL">MRL</option>
                <option value="MR">MR</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="doorType">
                Door type
              </label>
              <select
                id="doorType"
                className={fieldClass}
                value={calc.doorType}
                onChange={(e) => setCalcField('doorType', e.target.value)}
              >
                <option value="CENTER_OPEN">Center open</option>
                <option value="TELESCOPIC">Telescopic</option>
                <option value="SWING">Swing</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="doorWidthMm">
                Door width (mm)
              </label>
              <input
                id="doorWidthMm"
                type="number"
                className={fieldClass}
                value={calc.doorWidthMm}
                onChange={(e) => setCalcField('doorWidthMm', e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="buildingUsage">
                Building usage
              </label>
              <select
                id="buildingUsage"
                className={fieldClass}
                value={calc.buildingUsage}
                onChange={(e) => setCalcField('buildingUsage', e.target.value)}
              >
                <option value="RESIDENTIAL">Residential</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="HOSPITAL">Hospital</option>
                <option value="INDUSTRIAL">Industrial</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="marginPercent">
                Margin (%)
              </label>
              <input
                id="marginPercent"
                type="number"
                step="0.01"
                className={fieldClass}
                value={calc.marginPercent}
                onChange={(e) => setCalcField('marginPercent', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="validUntil">
              Valid until (optional)
            </label>
            <input
              id="validUntil"
              type="date"
              className={fieldClass}
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="notes">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              className={fieldClass}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
