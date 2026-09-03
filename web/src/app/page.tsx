'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { BarList, ColumnChart } from '@/components/charts';
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
import { formatEtb, formatNumber } from '@/lib/money';

const ROLE_LABELS: Record<string, string> = {
  CEO: 'Chief Executive',
  GENERAL_MANAGER: 'General Manager',
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
  SPEC_CALCULATION: 'Spec calculation',
  QUOTATION: 'Quotation',
  PROFORMA: 'Proforma',
  CONTRACT: 'Contract',
  EXECUTION: 'Execution',
};

/** 1-5 on the ordinal ramp: later stage, darker mark. Length and darkness
 *  both encode progress, so the chart survives greyscale and print. */
const STAGE_TONE: Record<PipelineStage['status'], 1 | 2 | 3 | 4 | 5> = {
  LEAD: 1,
  SITE_SURVEY: 1,
  SPEC_CALCULATION: 2,
  QUOTATION: 3,
  PROFORMA: 3,
  CONTRACT: 4,
  EXECUTION: 5,
};

const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const plural = (count: number, noun: string): string =>
  `${formatNumber(count)} ${noun}${count === 1 ? '' : 's'}`;

const dayLabel = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const metaClass =
  'font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

const Card = ({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={`rounded-xl border border-slate-200 bg-white ${className}`}>
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
      <h2 className={metaClass}>{title}</h2>
      {action}
    </div>
    <div className="p-5">{children}</div>
  </section>
);

const CardLink = ({ href, children }: { href?: string; children: ReactNode }) =>
  href ? (
    <a href={href} className="text-xs font-medium text-gold-600 hover:underline">
      {children} →
    </a>
  ) : null;

/**
 * A KPI is a stat tile, not a one-bar chart. `tone` is the reserved status
 * palette and always ships beside a label, so colour never carries the
 * meaning by itself.
 */
const Kpi = ({
  label,
  value,
  sub,
  tone = 'plain',
  href,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'plain' | 'critical';
  href?: string;
}) => {
  const body = (
    <>
      <p className={metaClass}>{label}</p>
      <p
        className={`font-display mt-1.5 whitespace-nowrap text-[1.35rem] font-bold leading-tight tabular-nums ${
          tone === 'critical' ? 'text-status-critical' : 'text-slate-900'
        }`}
      >
        {value.replace('.00 ETB', ' ETB')}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </>
  );
  return (
    <div className="min-w-0 flex-1 border-slate-200 px-5 py-4 first:pl-0 sm:border-l sm:first:border-l-0">
      {href ? (
        <a href={href} className="block rounded-lg outline-none transition hover:opacity-75">
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
};

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

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const linkTo = (href: string): string | undefined =>
    openable.has(href) ? href : undefined;

  const sales = summary?.sales;
  const service = summary?.service;
  const finance = summary?.finance;
  const totals = summary?.totals;

  const activeProjects =
    sales?.pipeline.reduce((count, stage) => count + stage.count, 0) ?? 0;

  const collections = (finance?.collectionsByMonth ?? []).map((entry) => {
    const monthIndex = Number(entry.month.slice(5, 7)) - 1;
    return {
      label: MONTH_INITIALS[monthIndex] ?? '',
      fullLabel: `${MONTH_NAMES[monthIndex] ?? entry.month} ${entry.month.slice(0, 4)}`,
      value: Number(entry.totalEtb),
    };
  });

  const collectedYear = collections.reduce((total, point) => total + point.value, 0);

  const ageing = finance
    ? [
        { label: 'Current', value: Number(finance.agingBuckets.currentEtb), tone: 1 as const },
        { label: '1–30 days', value: Number(finance.agingBuckets.d1_30Etb), tone: 2 as const },
        { label: '31–60 days', value: Number(finance.agingBuckets.d31_60Etb), tone: 3 as const },
        { label: '61–90 days', value: Number(finance.agingBuckets.d61_90Etb), tone: 4 as const },
        { label: 'Over 90 days', value: Number(finance.agingBuckets.d90PlusEtb), tone: 5 as const },
      ]
    : [];

  const serviceTiles = service
    ? [
        { label: 'Due in 7 days', value: service.servicesDueThisWeek, note: 'Scheduled visits', bad: false },
        { label: 'Overdue', value: service.servicesOverdue, note: 'Past the service date', bad: service.servicesOverdue > 0 },
        { label: 'Breakdowns', value: service.openBreakdowns, note: 'Open tickets', bad: service.openBreakdowns > 0 },
        { label: 'Emergencies', value: service.emergencyBreakdowns, note: '30-minute SLA', bad: service.emergencyBreakdowns > 0 },
      ]
    : [];

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 sm:px-8">
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight text-slate-900">
              Dashboard
            </h1>
            <p className={metaClass}>
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-white">
              {initials}
            </span>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-slate-900">{profile.fullName}</p>
              <p className="text-xs text-slate-500">
                {ROLE_LABELS[profile.role] ?? profile.role}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="space-y-5 px-6 py-6 sm:px-8">
          {error ? (
            <p role="alert" className="rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {/* KPI strip. Stat tiles, deliberately not a chart — these are
              single current values, and a one-bar bar chart is never the
              right form for one. */}
          {sales || finance ? (
            <section className="flex flex-col rounded-xl border border-slate-200 bg-white px-5 sm:flex-row sm:px-6">
              {sales ? (
                <Kpi
                  label="Open pipeline"
                  value={formatEtb(sales.openPipelineValueEtb)}
                  sub={`${plural(activeProjects, 'project')} in play`}
                  href={linkTo('/projects')}
                />
              ) : null}
              {sales ? (
                <Kpi
                  label="Won this month"
                  value={formatEtb(sales.wonThisMonth.valueEtb)}
                  sub={`${plural(sales.wonThisMonth.count, 'project')} reached contract`}
                  href={linkTo('/projects')}
                />
              ) : null}
              {finance ? (
                <Kpi
                  label="Collected this month"
                  value={formatEtb(finance.revenueThisMonthEtb)}
                  sub="Payments received"
                  href={linkTo('/invoices')}
                />
              ) : null}
              {finance ? (
                <Kpi
                  label="Outstanding"
                  value={formatEtb(finance.outstandingTotalEtb)}
                  sub={`${plural(finance.outstandingInvoiceCount, 'invoice')} with a balance`}
                  href={linkTo('/receivables')}
                />
              ) : null}
              {finance ? (
                <Kpi
                  label="Past due"
                  value={formatEtb(finance.overdueTotalEtb)}
                  sub={`${plural(finance.overdueInvoiceCount, 'invoice')} past the due date`}
                  tone={Number(finance.overdueTotalEtb) > 0 ? 'critical' : 'plain'}
                  href={linkTo('/receivables')}
                />
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-3">
            {finance ? (
              <Card
                title="Collections · last 12 months"
                className="lg:col-span-2"
                action={<CardLink href={linkTo('/invoices')}>Payments</CardLink>}
              >
                <div className="mb-4 flex items-baseline gap-3">
                  <p className="font-display text-2xl font-bold tabular-nums text-slate-900">
                    {formatEtb(collectedYear.toFixed(2))}
                  </p>
                  <p className="text-xs text-slate-500">received over the period</p>
                </div>
                <ColumnChart points={collections} />
              </Card>
            ) : null}

            {sales ? (
              <Card
                title="Pipeline by stage"
                action={<CardLink href={linkTo('/projects')}>All projects</CardLink>}
              >
                <BarList
                  emptyNote="No projects in the pipeline. Start one on Projects."
                  rows={sales.pipeline.map((stage) => ({
                    label: STAGE_LABELS[stage.status],
                    value: stage.count,
                    note:
                      Number(stage.valueEtb) > 0
                        ? `${formatNumber(stage.count)} · ${formatEtb(stage.valueEtb).replace('.00 ETB', '')}`
                        : `${formatNumber(stage.count)} · not yet priced`,
                    tone: STAGE_TONE[stage.status],
                    href: linkTo('/projects'),
                  }))}
                />
              </Card>
            ) : null}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {finance ? (
              <Card
                title="Receivables ageing"
                action={<CardLink href={linkTo('/receivables')}>Full report</CardLink>}
              >
                <BarList
                  rows={ageing}
                  emptyNote="Nothing outstanding. Every issued invoice is settled."
                />
              </Card>
            ) : null}

            {service ? (
              <Card
                title="Service & breakdowns"
                action={<CardLink href={linkTo('/maintenance')}>Maintenance</CardLink>}
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
                  {serviceTiles.map((tile) => (
                    <div key={tile.label}>
                      <dt className={metaClass}>{tile.label}</dt>
                      <dd
                        className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                          tile.bad ? 'text-status-critical' : 'text-slate-900'
                        }`}
                      >
                        {formatNumber(tile.value)}
                      </dd>
                      <dd className="text-xs text-slate-500">{tile.note}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            ) : null}

            {service ? (
              <Card
                title="Next service visits"
                action={<CardLink href={linkTo('/maintenance')}>Schedule</CardLink>}
              >
                {service.upcomingServices.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    No visits scheduled in the next 7 days.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {service.upcomingServices.slice(0, 5).map((visit) => (
                      <li
                        key={visit.contractId}
                        className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-900">
                            {visit.assetName}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {visit.customerName}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${
                            visit.overdue
                              ? 'bg-red-50 text-status-critical'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {visit.overdue ? 'Overdue' : dayLabel(visit.nextServiceAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ) : null}
          </div>

          {/* Register counts. A slim strip rather than three big tiles — they
              are context for everything above, not headline figures. */}
          {totals ? (
            <section className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-slate-200 bg-white px-5 py-3.5">
              <span className={metaClass}>On the books</span>
              {[
                { label: 'Customers', value: totals.customers, href: linkTo('/customers') },
                { label: 'Registered assets', value: totals.assets, href: linkTo('/assets') },
                { label: 'Staff', value: totals.employees, href: linkTo('/employees') },
              ].map((entry) => (
                <span key={entry.label} className="flex items-baseline gap-2 text-sm">
                  <span className="font-display font-bold tabular-nums text-slate-900">
                    {formatNumber(entry.value)}
                  </span>
                  {entry.href ? (
                    <a href={entry.href} className="text-slate-500 hover:text-slate-900 hover:underline">
                      {entry.label}
                    </a>
                  ) : (
                    <span className="text-slate-500">{entry.label}</span>
                  )}
                </span>
              ))}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
