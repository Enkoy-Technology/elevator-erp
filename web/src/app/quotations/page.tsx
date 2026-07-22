'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  approveQuotation,
  cancelQuotation,
  convertQuotationToContract,
  convertQuotationToProforma,
  createQuotationFromCalc,
  downloadQuotationPdf,
  getAccessToken,
  listProjects,
  listQuotations,
  rejectQuotation,
  type CreateQuotationPayload,
  type Project,
  type Quotation,
  type QuoteStatus,
} from '@/lib/api';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PROFORMA: 'Proforma',
  CONTRACT: 'Contract',
  CANCELLED: 'Cancelled',
};

const STATUS_BADGE: Record<QuoteStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  PROFORMA: 'bg-sky-100 text-sky-700',
  CONTRACT: 'bg-navy-800 text-white',
  CANCELLED: 'bg-slate-200 text-slate-500',
};

const FILTERS: readonly QuoteStatus[] = [
  'DRAFT',
  'APPROVED',
  'PROFORMA',
  'CONTRACT',
  'REJECTED',
];

const CALC_DEFAULTS: CreateQuotationPayload = {
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
  taxPercent: 15,
};

const etbFormatter = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const formatEtb = (value: string): string =>
  `${etbFormatter.format(Number(value))} ETB`;

export default function QuotationsPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<Quotation[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [calc, setCalc] = useState<CreateQuotationPayload>(CALC_DEFAULTS);
  const [validUntil, setValidUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, status: QuoteStatus | '') => {
      setLoading(true);
      setError(null);
      try {
        const [quotePage, projectPage] = await Promise.all([
          listQuotations({
            status: status || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
          listProjects({ page: 1, pageSize: 100 }),
        ]);
        setQuotes(quotePage.items);
        setPage(quotePage.page);
        setTotal(quotePage.total);
        setTotalPages(quotePage.totalPages);
        setProjects(projectPage.items);
        setProjectMap(
          Object.fromEntries(
            projectPage.items.map((p) => [p.id, p.name] as const),
          ),
        );
        setProjectId((prev) => prev || projectPage.items[0]?.id || '');
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load quotations',
        );
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
    void refresh(page, statusFilter);
  }, [router, refresh, page, statusFilter]);

  const setFilter = (next: QuoteStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const openDrawer = () => {
    setCalc(CALC_DEFAULTS);
    setValidUntil('');
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const setCalcField = (field: keyof CreateQuotationPayload, value: string) => {
    setCalc((prev) => ({
      ...prev,
      [field]:
        typeof CALC_DEFAULTS[field] === 'number' ? Number(value) : value,
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
      });
      closeDrawer();
      setPage(1);
      setStatusFilter('');
      await refresh(1, '');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create quotation',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (action: () => Promise<unknown>, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await refresh(page, statusFilter);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const onReject = (quote: Quotation) => {
    const reason = window.prompt('Reason for rejecting this quotation?');
    if (!reason) {
      return;
    }
    void runAction(() => rejectQuotation(quote.id, reason), quote.id);
  };

  const onDownload = async (quote: Quotation) => {
    setBusyId(quote.id);
    setError(null);
    try {
      await downloadQuotationPdf(quote.id, quote.quoteNumber);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'PDF download failed');
    } finally {
      setBusyId(null);
    }
  };

  const primaryBtn =
    'rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60';
  const ghostBtn =
    'rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-navy-600 hover:text-navy-800 disabled:opacity-60';
  const dangerBtn =
    'rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60';

  const renderActions = (quote: Quotation) => {
    const busy = busyId === quote.id;
    return (
      <div className="flex flex-wrap gap-2">
        {quote.status === 'DRAFT' ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(() => approveQuotation(quote.id), quote.id)}
              className={primaryBtn}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject(quote)}
              className={dangerBtn}
            >
              Reject
            </button>
          </>
        ) : null}
        {quote.status === 'APPROVED' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(() => convertQuotationToProforma(quote.id), quote.id)
            }
            className={primaryBtn}
          >
            → Proforma
          </button>
        ) : null}
        {quote.status === 'PROFORMA' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(() => convertQuotationToContract(quote.id), quote.id)
            }
            className={primaryBtn}
          >
            → Contract
          </button>
        ) : null}
        {['DRAFT', 'APPROVED', 'PROFORMA'].includes(quote.status) ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction(() => cancelQuotation(quote.id), quote.id)}
            className={ghostBtn}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDownload(quote)}
          className={ghostBtn}
        >
          PDF
        </button>
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
                Draft → approve → proforma → contract
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/projects"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-navy-600 hover:text-navy-800"
              >
                Projects
              </Link>
              <button
                type="button"
                onClick={openDrawer}
                className="rounded-lg bg-navy-800 px-3 py-1.5 font-semibold text-white transition hover:bg-navy-700"
              >
                Create quote
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filter
              </span>
              <button
                type="button"
                onClick={() => setFilter('')}
                className={
                  statusFilter === ''
                    ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                }
              >
                All
              </button>
              {FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={
                    statusFilter === s
                      ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                  }
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : quotes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No quotations yet.</p>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Draft your first quote
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {quotes.map((q) => (
                    <li
                      key={q.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-medium text-slate-900">
                          <span className="font-mono text-sm">
                            {q.quoteNumber}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[q.status]}`}
                          >
                            {STATUS_LABEL[q.status]}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {projectMap[q.projectId] ?? q.projectId.slice(0, 8)}
                          {' · '}
                          <span className="font-semibold text-navy-800">
                            {formatEtb(q.totalPriceEtb)}
                          </span>
                          {q.validUntil
                            ? ` · valid to ${q.validUntil.slice(0, 10)}`
                            : ''}
                        </p>
                      </div>
                      {renderActions(q)}
                    </li>
                  ))}
                </ul>
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
        description="Prices the elevator spec server-side and saves a DRAFT."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeDrawer}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-quote-form"
              disabled={submitting || projects.length === 0}
              className="flex-1 rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
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
            <div>
              <label className={labelClass} htmlFor="taxPercent">
                Tax (%)
              </label>
              <input
                id="taxPercent"
                type="number"
                step="0.01"
                className={fieldClass}
                value={calc.taxPercent}
                onChange={(e) => setCalcField('taxPercent', e.target.value)}
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
        </form>
      </SideDrawer>
    </div>
  );
}
