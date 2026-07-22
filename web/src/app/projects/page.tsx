'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

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

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'outline-none transition focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20';

const label =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

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
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [siteCity, setSiteCity] = useState('Addis Ababa');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [advancingId, setAdvancingId] = useState<string | null>(null);

  const refresh = useCallback(async (status?: ProjectStatus | '') => {
    setLoading(true);
    setError(null);
    try {
      const [projectRows, customerRows] = await Promise.all([
        listProjects(status || undefined),
        listCustomers(),
      ]);
      setProjects(projectRows);
      setCustomers(customerRows);
      setCustomerId((prev) => prev || customerRows[0]?.id || '');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load projects',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(statusFilter);
  }, [router, refresh, statusFilter]);

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customerId) {
      setError('Create a customer first, then add a project.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createProject({
        customerId,
        name,
        siteCity: siteCity || undefined,
      });
      setName('');
      await refresh(statusFilter);
    } catch (err) {
      setError(
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
      await refresh(statusFilter);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Status update failed',
      );
    } finally {
      setAdvancingId(null);
    }
  };

  const customerName = (id: string): string =>
    customers.find((c) => c.id === id)?.name ?? id.slice(0, 8);

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
                Sales workflow LEAD → COMPLETED (illegal jumps blocked by API)
              </p>
            </div>
            <div className="flex gap-2 text-sm">
              <Link
                href="/customers"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-navy-600 hover:text-navy-800"
              >
                Customers
              </Link>
              <span className="rounded-lg bg-navy-800 px-3 py-1.5 font-medium text-white">
                Project pipeline
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 space-y-6 bg-slate-50 p-8">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold">
              New project / lead
            </h2>
            <form
              onSubmit={onCreate}
              className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div>
                <label className={label} htmlFor="customer">
                  Customer
                </label>
                <select
                  id="customer"
                  className={field}
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
                <label className={label} htmlFor="pname">
                  Project name
                </label>
                <input
                  id="pname"
                  className={field}
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Bole Twin Towers — Lift A"
                />
              </div>
              <div>
                <label className={label} htmlFor="city">
                  Site city
                </label>
                <input
                  id="city"
                  className={field}
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={submitting || customers.length === 0}
                  className="w-full rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Create lead'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Filter
              </span>
              <button
                type="button"
                onClick={() => setStatusFilter('')}
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
                  onClick={() => setStatusFilter(s)}
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
              <p className="text-sm text-slate-500">No projects yet.</p>
            ) : (
              <ul className="space-y-3">
                {projects.map((p) => {
                  const next = NEXT_PROJECT_STATUSES[p.status];
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-500">
                          {customerName(p.customerId)}
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
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
