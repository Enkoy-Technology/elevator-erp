'use client';

import Link from 'next/link';
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  createProject,
  getAccessToken,
  listCustomers,
  listProjects,
  NEXT_PROJECT_STATUSES,
  updateProjectStatus,
  type Customer,
  type Project,
  type ProjectStatus,
} from '@/lib/api';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<ProjectStatus, string> = {
  LEAD: 'Lead',
  SITE_SURVEY: 'Site survey',
  SPEC_CALCULATION: 'Spec calculation',
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma',
  CONTRACT: 'Contract',
  EXECUTION: 'Execution',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [siteCity, setSiteCity] = useState('Addis Ababa');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, status: ProjectStatus | '') => {
      setLoading(true);
      setError(null);
      try {
        const [projectPage, customerPage] = await Promise.all([
          listProjects({
            status: status || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
          listCustomers({ page: 1, pageSize: 100 }),
        ]);
        setProjects(projectPage.items);
        setPage(projectPage.page);
        setTotal(projectPage.total);
        setTotalPages(projectPage.totalPages);
        setCustomers(customerPage.items);
        setCustomerMap(
          Object.fromEntries(
            customerPage.items.map((c) => [c.id, c.name] as const),
          ),
        );
        setCustomerId((prev) => prev || customerPage.items[0]?.id || '');
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load projects',
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

  const setFilter = (next: ProjectStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const openDrawer = () => {
    setName('');
    setSiteCity('Addis Ababa');
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setFormError('Create a customer first, then add a project.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createProject({
        customerId,
        name,
        siteCity: siteCity || undefined,
      });
      closeDrawer();
      setPage(1);
      setStatusFilter('');
      await refresh(1, '');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create project',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onAdvance = async (project: Project, next: ProjectStatus) => {
    setAdvancingId(project.id);
    setError(null);
    try {
      await updateProjectStatus(project.id, next);
      await refresh(page, statusFilter);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Status update failed',
      );
    } finally {
      setAdvancingId(null);
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
                Project pipeline
              </h1>
              <p className="text-sm text-slate-500">
                Sales workflow LEAD → COMPLETED
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href="/customers"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-navy-600 hover:text-navy-800"
              >
                Customers
              </Link>
              <span className="rounded-lg bg-navy-800 px-3 py-1.5 font-medium text-white">
                Project pipeline
              </span>
              <button
                type="button"
                onClick={openDrawer}
                className="rounded-lg bg-navy-800 px-3 py-1.5 font-semibold text-white transition hover:bg-navy-700"
              >
                Create project
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
              {(
                [
                  'LEAD',
                  'SITE_SURVEY',
                  'QUOTATION',
                  'CONTRACT',
                  'EXECUTION',
                  'COMPLETED',
                ] as const
              ).map((s) => (
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
            ) : projects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No projects yet.</p>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Create your first lead
                </button>
              </div>
            ) : (
              <>
                <ul className="space-y-3">
                  {projects.map((p) => {
                    const next = NEXT_PROJECT_STATUSES[p.status];
                    return (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-slate-900">
                            {p.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {customerMap[p.customerId] ??
                              p.customerId.slice(0, 8)}
                            {p.siteCity ? ` · ${p.siteCity}` : ''}
                            {' · '}
                            <span className="font-semibold text-navy-800">
                              {STATUS_LABEL[p.status]}
                            </span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {next.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={advancingId === p.id}
                              onClick={() => void onAdvance(p, s)}
                              className={
                                s === 'CANCELLED'
                                  ? 'rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60'
                                  : 'rounded-lg bg-navy-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-navy-700 disabled:opacity-60'
                              }
                            >
                              → {STATUS_LABEL[s]}
                            </button>
                          ))}
                          {next.length === 0 ? (
                            <span className="text-xs text-slate-400">
                              Terminal
                            </span>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
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
        title="Create project"
        description="Starts at LEAD in the sales pipeline."
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
              form="create-project-form"
              disabled={submitting || customers.length === 0}
              className="flex-1 rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save lead'}
            </button>
          </div>
        }
      >
        <form
          id="create-project-form"
          onSubmit={(e) => void onCreate(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="customer">
              Customer
            </label>
            <select
              id="customer"
              className={fieldClass}
              required
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              {customers.length === 0 ? (
                <option value="">No customers yet</option>
              ) : (
                customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="pname">
              Project name
            </label>
            <input
              id="pname"
              className={fieldClass}
              required
              minLength={2}
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bole Twin Towers — Lift A"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="city">
              Site city
            </label>
            <input
              id="city"
              className={fieldClass}
              value={siteCity}
              onChange={(e) => setSiteCity(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
