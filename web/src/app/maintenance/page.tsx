'use client';

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  BREAKDOWN_SEVERITIES,
  createBreakdown,
  createMaintenanceContract,
  getAccessToken,
  listAssets,
  listBreakdowns,
  listEmployees,
  listMaintenanceContracts,
  logServiceVisit,
  MAINTENANCE_RECURRENCES,
  updateBreakdown,
  type Asset,
  type Breakdown,
  type BreakdownSeverity,
  type BreakdownStatus,
  type Employee,
  type MaintenanceContract,
  type MaintenanceRecurrence,
  optional,
} from '@/lib/api';

const PAGE_SIZE = 20;

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Mirrors the API's advanceServiceDate: clamp instead of overflowing a short
 *  month (Jan 31 + 1 month must be Feb 28, not Mar 3). */
const addMonthsIso = (iso: string, months: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay));
  return date.toISOString().slice(0, 10);
};

export default function MaintenancePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'contracts' | 'breakdowns'>('contracts');
  const [contracts, setContracts] = useState<MaintenanceContract[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [contractDrawer, setContractDrawer] = useState(false);
  const [visitDrawer, setVisitDrawer] = useState(false);
  const [breakdownDrawer, setBreakdownDrawer] = useState(false);
  const [visitContractId, setVisitContractId] = useState<string | null>(null);
  const [visitNotes, setVisitNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [assetId, setAssetId] = useState('');
  const [recurrence, setRecurrence] =
    useState<MaintenanceRecurrence>('MONTHLY');
  const [startDate, setStartDate] = useState(todayIso());
  const [nextServiceAt, setNextServiceAt] = useState(addMonthsIso(todayIso(), 1));
  const [contractNotes, setContractNotes] = useState('');

  const [bdAssetId, setBdAssetId] = useState('');
  const [bdTitle, setBdTitle] = useState('');
  const [bdDescription, setBdDescription] = useState('');
  const [bdSeverity, setBdSeverity] = useState<BreakdownSeverity>('MEDIUM');
  const [bdAssignee, setBdAssignee] = useState('');

  const refresh = useCallback(
    async (nextTab: 'contracts' | 'breakdowns', nextPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const [assetPage, employeePage] = await Promise.all([
          optional(listAssets({ page: 1, pageSize: 100 })),
          optional(listEmployees({ page: 1, pageSize: 100 })),
        ]);
        setAssets(assetPage.items);
        setEmployees(employeePage.items);
        setAssetMap(
          Object.fromEntries(
            assetPage.items.map((a) => [a.id, a.name] as const),
          ),
        );
        setAssetId((prev) => prev || assetPage.items[0]?.id || '');
        setBdAssetId((prev) => prev || assetPage.items[0]?.id || '');

        if (nextTab === 'contracts') {
          const result = await listMaintenanceContracts({
            page: nextPage,
            pageSize: PAGE_SIZE,
          });
          setContracts(result.items);
          setPage(result.page);
          setTotal(result.total);
          setTotalPages(result.totalPages);
        } else {
          const result = await listBreakdowns({
            page: nextPage,
            pageSize: PAGE_SIZE,
          });
          setBreakdowns(result.items);
          setPage(result.page);
          setTotal(result.total);
          setTotalPages(result.totalPages);
        }
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load maintenance',
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
    void refresh(tab, page);
  }, [router, refresh, tab, page]);

  const switchTab = (next: 'contracts' | 'breakdowns') => {
    setPage(1);
    setTab(next);
  };

  const onCreateContract = async (event: FormEvent) => {
    event.preventDefault();
    if (!assetId) {
      setFormError('Register an asset first.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createMaintenanceContract({
        assetId,
        recurrence,
        startDate,
        nextServiceAt,
        notes: contractNotes || undefined,
      });
      setContractDrawer(false);
      setPage(1);
      await refresh('contracts', 1);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create contract',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onLogVisit = async (event: FormEvent) => {
    event.preventDefault();
    if (!visitContractId) {
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await logServiceVisit(visitContractId, {
        notes: visitNotes || undefined,
      });
      setVisitDrawer(false);
      setVisitContractId(null);
      setVisitNotes('');
      await refresh('contracts', page);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to log visit',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onCreateBreakdown = async (event: FormEvent) => {
    event.preventDefault();
    if (!bdAssetId) {
      setFormError('Register an asset first.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createBreakdown({
        assetId: bdAssetId,
        title: bdTitle,
        description: bdDescription || undefined,
        severity: bdSeverity,
        assignedUserId: bdAssignee || undefined,
      });
      setBreakdownDrawer(false);
      setTab('breakdowns');
      setPage(1);
      await refresh('breakdowns', 1);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to open breakdown',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onAdvanceBreakdown = async (
    item: Breakdown,
    status: BreakdownStatus,
  ) => {
    try {
      await updateBreakdown(item.id, { status });
      await refresh('breakdowns', page);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update breakdown',
      );
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">
                Maintenance
              </h1>
              <p className="text-sm text-slate-500">
                Service contracts, visits, and breakdown follow-up
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {tab === 'contracts' ? (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setStartDate(todayIso());
                    setNextServiceAt(addMonthsIso(todayIso(), 1));
                    setRecurrence('MONTHLY');
                    setContractNotes('');
                    setContractDrawer(true);
                  }}
                  className={btnPrimary}
                >
                  New contract
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setBdTitle('');
                    setBdDescription('');
                    setBdSeverity('MEDIUM');
                    setBdAssignee('');
                    setBreakdownDrawer(true);
                  }}
                  className={btnPrimary}
                >
                  Open breakdown
                </button>
              )}
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
              onClick={() => switchTab('contracts')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'contracts'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Contracts
            </button>
            <button
              type="button"
              onClick={() => switchTab('breakdowns')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === 'breakdowns'
                  ? 'bg-navy-800 text-white'
                  : 'border border-slate-200 text-slate-600'
              }`}
            >
              Breakdowns
            </button>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : tab === 'contracts' ? (
              contracts.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No maintenance contracts yet.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                          <th className="py-2 pr-4 font-semibold">Asset</th>
                          <th className="py-2 pr-4 font-semibold">
                            Recurrence
                          </th>
                          <th className="py-2 pr-4 font-semibold">
                            Next service
                          </th>
                          <th className="py-2 pr-4 font-semibold">Last</th>
                          <th className="py-2 pr-4 font-semibold">Status</th>
                          <th className="py-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contracts.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b border-slate-100 last:border-0"
                          >
                            <td className="py-3 pr-4 font-medium text-slate-900">
                              {assetMap[c.assetId] ?? c.assetId.slice(0, 8)}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {c.recurrence}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {c.nextServiceAt}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {c.lastServiceAt ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {c.status}
                            </td>
                            <td className="py-3">
                              {c.status === 'ACTIVE' ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVisitContractId(c.id);
                                    setVisitNotes('');
                                    setFormError(null);
                                    setVisitDrawer(true);
                                  }}
                                  className="text-sm font-semibold text-navy-800 hover:underline"
                                >
                                  Log visit
                                </button>
                              ) : (
                                '—'
                              )}
                            </td>
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
            ) : breakdowns.length === 0 ? (
              <p className="text-sm text-slate-500">No breakdown tickets.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Title</th>
                        <th className="py-2 pr-4 font-semibold">Asset</th>
                        <th className="py-2 pr-4 font-semibold">Severity</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdowns.map((b) => (
                        <tr
                          key={b.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {b.title}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {assetMap[b.assetId] ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {b.severity}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {b.status}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-2">
                              {b.status === 'OPEN' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onAdvanceBreakdown(b, 'ASSIGNED')
                                  }
                                  className="text-sm font-semibold text-navy-800 hover:underline"
                                >
                                  Assign
                                </button>
                              ) : null}
                              {b.status !== 'DONE' ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onAdvanceBreakdown(b, 'DONE')
                                  }
                                  className="text-sm font-semibold text-navy-800 hover:underline"
                                >
                                  Done
                                </button>
                              ) : null}
                            </div>
                          </td>
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
        open={contractDrawer}
        onClose={() => setContractDrawer(false)}
        title="New maintenance contract"
        description="Link a service schedule to a registered asset."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setContractDrawer(false)}
              className={`${btnSecondary} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="contract-form"
              disabled={submitting}
              className={`${btnPrimary} flex-1`}
            >
              {submitting ? 'Saving…' : 'Create'}
            </button>
          </div>
        }
      >
        <form
          id="contract-form"
          onSubmit={(e) => void onCreateContract(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="assetId">
              Asset
            </label>
            <select
              id="assetId"
              className={fieldClass}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              {assets.length === 0 ? (
                <option value="">No assets</option>
              ) : (
                assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.category})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="recurrence">
              Recurrence
            </label>
            <select
              id="recurrence"
              className={fieldClass}
              value={recurrence}
              onChange={(e) =>
                setRecurrence(e.target.value as MaintenanceRecurrence)
              }
            >
              {MAINTENANCE_RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="startDate">
              Start date
            </label>
            <input
              id="startDate"
              type="date"
              className={fieldClass}
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="nextServiceAt">
              Next service
            </label>
            <input
              id="nextServiceAt"
              type="date"
              className={fieldClass}
              required
              value={nextServiceAt}
              onChange={(e) => setNextServiceAt(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="contractNotes">
              Notes
            </label>
            <textarea
              id="contractNotes"
              className={fieldClass}
              rows={3}
              value={contractNotes}
              onChange={(e) => setContractNotes(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>

      <SideDrawer
        open={visitDrawer}
        onClose={() => setVisitDrawer(false)}
        title="Log service visit"
        description="Marks today as last service and advances the next date."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisitDrawer(false)}
              className={`${btnSecondary} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="visit-form"
              disabled={submitting}
              className={`${btnPrimary} flex-1`}
            >
              {submitting ? 'Saving…' : 'Log visit'}
            </button>
          </div>
        }
      >
        <form
          id="visit-form"
          onSubmit={(e) => void onLogVisit(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="visitNotes">
              Notes
            </label>
            <textarea
              id="visitNotes"
              className={fieldClass}
              rows={4}
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>

      <SideDrawer
        open={breakdownDrawer}
        onClose={() => setBreakdownDrawer(false)}
        title="Open breakdown"
        description="Track a fault from open → assigned → done."
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setBreakdownDrawer(false)}
              className={`${btnSecondary} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="breakdown-form"
              disabled={submitting}
              className={`${btnPrimary} flex-1`}
            >
              {submitting ? 'Saving…' : 'Open ticket'}
            </button>
          </div>
        }
      >
        <form
          id="breakdown-form"
          onSubmit={(e) => void onCreateBreakdown(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="bdAssetId">
              Asset
            </label>
            <select
              id="bdAssetId"
              className={fieldClass}
              value={bdAssetId}
              onChange={(e) => setBdAssetId(e.target.value)}
            >
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="bdTitle">
              Title
            </label>
            <input
              id="bdTitle"
              className={fieldClass}
              required
              minLength={2}
              value={bdTitle}
              onChange={(e) => setBdTitle(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="bdSeverity">
              Severity
            </label>
            <select
              id="bdSeverity"
              className={fieldClass}
              value={bdSeverity}
              onChange={(e) =>
                setBdSeverity(e.target.value as BreakdownSeverity)
              }
            >
              {BREAKDOWN_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="bdAssignee">
              Assign to (optional)
            </label>
            <select
              id="bdAssignee"
              className={fieldClass}
              value={bdAssignee}
              onChange={(e) => setBdAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="bdDescription">
              Description
            </label>
            <textarea
              id="bdDescription"
              className={fieldClass}
              rows={3}
              value={bdDescription}
              onChange={(e) => setBdDescription(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
