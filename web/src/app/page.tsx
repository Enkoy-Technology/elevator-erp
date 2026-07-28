'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { modulesForRole } from '@/components/module-nav';
import { Sidebar } from '@/components/sidebar';
import {
  AuthProfile,
  getAccessToken,
  getCurrentRole,
  getDashboardSummary,
  getProfile,
  logout,
  type DashboardSummary,
  type PipelineStage,
} from '@/lib/api';

const ROLE_LABELS: Record<string, string> = {
  CEO: 'Chief Executive',
  SALES_MANAGER: 'Sales Manager',
  TECHNICAL_LEAD: 'Technical Lead',
  FIELD_ENGINEER: 'Field Engineer',
  FINANCE: 'Finance',
  WAREHOUSE_MANAGER: 'Warehouse Manager',
  DISPATCHER: 'Dispatcher',
  CUSTOMER: 'Customer',
  ADMIN: 'Administrator',
};

const STAGE_LABELS: Record<PipelineStage['status'], string> = {
  LEAD: 'Lead',
  SITE_SURVEY: 'Site survey',
  SPEC_CALCULATION: 'Spec',
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma',
  CONTRACT: 'Contract',
  EXECUTION: 'Execution',
};

const etb = (value: string | number): string =>
  `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} ETB`;

const dayLabel = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function StatTile({
  label,
  value,
  sub,
  tone = 'plain',
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'plain' | 'warn' | 'danger' | 'good';
  href?: string;
}) {
  const toneClass = {
    plain: 'border-slate-200 bg-white',
    good: 'border-emerald-200 bg-emerald-50',
    warn: 'border-amber-200 bg-amber-50',
    danger: 'border-red-200 bg-red-50',
  }[tone];
  const valueClass = {
    plain: 'text-slate-900',
    good: 'text-emerald-700',
    warn: 'text-amber-800',
    danger: 'text-red-700',
  }[tone];

  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className={`font-display mt-1.5 text-2xl font-semibold ${valueClass}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </>
  );

  const className = `rounded-xl border p-4 ${toneClass}`;
  return href ? (
    <a href={href} className={`${className} block transition hover:shadow-sm`}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Hrefs this role can actually open, so no tile links somewhere that 403s. */
  const [openable, setOpenable] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setOpenable(
      new Set(
        modulesForRole(getCurrentRole())
          .map((module) => module.href)
          .filter((href): href is string => href !== null),
      ),
    );
    getProfile()
      .then(setProfile)
      .catch(() => router.replace('/login'));
    getDashboardSummary()
      .then(setSummary)
      .catch(() => setError('Could not load dashboard figures'));
  }, [router]);

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">Loading your workspace…</p>
      </main>
    );
  }

  const initials = profile.fullName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const peakStage = Math.max(
    ...(summary?.sales?.pipeline.map((stage) => stage.count) ?? []),
    1,
  );

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-4">
          <div>
            <h1 className="font-display text-lg font-semibold">Dashboard</h1>
            <p className="text-xs text-slate-500">
              Where the business stands today
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-800 text-xs font-bold text-white">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-tight">
                  {profile.fullName}
                </p>
                <p className="text-xs text-slate-500">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </p>
              </div>
            </div>
            <button
              onClick={() => void onLogout()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 space-y-8 px-8 py-8">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {!summary ? (
            <p className="text-sm text-slate-500">Loading figures…</p>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {summary.sales ? (
                  <>
                    <StatTile
                      label="Open pipeline"
                      value={etb(summary.sales.openPipelineValueEtb)}
                      sub={`${summary.sales.pipeline.reduce((n, s) => n + s.count, 0)} active projects`}
                      href="/projects"
                    />
                    <StatTile
                      label="Won this month"
                      value={etb(summary.sales.wonThisMonth.valueEtb)}
                      sub={`${summary.sales.wonThisMonth.count} reached contract`}
                      tone={
                        summary.sales.wonThisMonth.count > 0 ? 'good' : 'plain'
                      }
                      href="/projects"
                    />
                  </>
                ) : null}

                {summary.service ? (
                  <>
                    <StatTile
                      label="Service due (7 days)"
                      value={String(summary.service.servicesDueThisWeek)}
                      sub={
                        summary.service.servicesOverdue > 0
                          ? `${summary.service.servicesOverdue} already overdue`
                          : 'nothing overdue'
                      }
                      tone={
                        summary.service.servicesOverdue > 0 ? 'warn' : 'plain'
                      }
                      href="/maintenance"
                    />
                    <StatTile
                      label="Open breakdowns"
                      value={String(summary.service.openBreakdowns)}
                      sub={
                        summary.service.emergencyBreakdowns > 0
                          ? `${summary.service.emergencyBreakdowns} emergency`
                          : 'no emergencies'
                      }
                      tone={
                        summary.service.emergencyBreakdowns > 0
                          ? 'danger'
                          : summary.service.openBreakdowns > 0
                            ? 'warn'
                            : 'plain'
                      }
                      href="/maintenance"
                    />
                  </>
                ) : null}
              </section>

              {summary.sales ? (
              <section className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="mb-5 flex items-baseline justify-between">
                  <h2 className="font-display text-base font-semibold">
                    Sales pipeline
                  </h2>
                  <a
                    href="/projects"
                    className="text-xs font-medium text-navy-700 hover:underline"
                  >
                    View projects →
                  </a>
                </div>
                <ul className="space-y-2.5">
                  {summary.sales.pipeline.map((stage) => (
                    <li key={stage.status} className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs font-medium text-slate-600">
                        {STAGE_LABELS[stage.status]}
                      </span>
                      <span className="h-6 flex-1 overflow-hidden rounded bg-slate-100">
                        {stage.count > 0 ? (
                          <span
                            className="flex h-full items-center justify-end rounded bg-navy-800 px-2 text-[11px] font-semibold text-white"
                            style={{
                              width: `${Math.max(
                                (stage.count / peakStage) * 100,
                                8,
                              )}%`,
                            }}
                          >
                            {stage.count}
                          </span>
                        ) : null}
                      </span>
                      <span className="w-32 shrink-0 text-right text-xs tabular-nums text-slate-500">
                        {Number(stage.valueEtb) > 0 ? etb(stage.valueEtb) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                {summary.service ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="font-display mb-4 text-base font-semibold">
                    Service visits coming up
                  </h2>
                  {summary.service.upcomingServices.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nothing scheduled in the next 7 days.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {summary.service.upcomingServices.map((visit) => (
                        <li
                          key={visit.contractId}
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {visit.assetName}
                            </p>
                            <p className="truncate text-xs text-slate-500">
                              {visit.customerName}
                            </p>
                          </div>
                          <span
                            className={
                              visit.overdue
                                ? 'shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700'
                                : 'shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600'
                            }
                          >
                            {visit.overdue ? 'Overdue · ' : ''}
                            {dayLabel(visit.nextServiceAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                ) : null}

                {summary.totals ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="font-display mb-4 text-base font-semibold">
                    On the books
                  </h2>
                  <dl className="space-y-3">
                    {[
                      {
                        label: 'Customers',
                        value: summary.totals.customers,
                        href: '/customers',
                      },
                      {
                        label: 'Registered assets',
                        value: summary.totals.assets,
                        href: '/assets',
                      },
                      {
                        label: 'Staff',
                        value: summary.totals.employees,
                        href: '/employees',
                      },
                    ]
                      .filter((row) => openable.has(row.href))
                      .map((row) => (
                        <div
                          key={row.label}
                          className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0"
                        >
                          <dt className="text-sm text-slate-600">
                            {row.label}
                          </dt>
                          <dd>
                            <a
                              href={row.href}
                              className="text-sm font-semibold tabular-nums text-navy-800 hover:underline"
                            >
                              {row.value}
                            </a>
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
                ) : null}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
