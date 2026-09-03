'use client';

import Link from 'next/link';
import { updatedColumn } from '@/components/updated-column';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ColumnDef } from '@tanstack/react-table';

import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import {
  FilterNotice,
  FilterSelect,
  ListToolbar,
  StatusPill,
} from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { csvRows, saveCsv } from '@/app/employees/csv';
import {
  ApiError,
  getAccessToken,
  listCustomers,
  listProjects,
  NEXT_PROJECT_STATUSES,
  updateProjectStatus,
  type Project,
  type ProjectStatus,
  optional,
} from '@/lib/api';
import { formatEtb } from '@/lib/money';

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

/** The stages worth filtering by — the same set the old pill row offered. */
const STAGE_FILTERS = [
  'LEAD',
  'SITE_SURVEY',
  'QUOTATION',
  'CONTRACT',
  'EXECUTION',
  'COMPLETED',
] as const;

/** One place decides what a stage looks like, so every list agrees. */
const STAGE_TONE: Record<
  ProjectStatus,
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  LEAD: 'neutral',
  SITE_SURVEY: 'neutral',
  SPEC_CALCULATION: 'neutral',
  QUOTATION: 'warn',
  PROFORMA: 'warn',
  CONTRACT: 'active',
  EXECUTION: 'active',
  COMPLETED: 'good',
  CANCELLED: 'danger',
};

/** Stages where the rep learns a number worth recording. */
const AMOUNT_FIELD = {
  QUOTATION: 'quotedAmountEtb',
  CONTRACT: 'contractAmountEtb',
} as const;

const ETB_AMOUNT = /^\d{1,12}(\.\d{1,2})?$/;

const CSV_HEADERS = ['Project', 'Customer', 'City', 'Stage', 'Value (ETB)'] as const;

const CANCELLED = Symbol('cancelled');
const INVALID = Symbol('invalid');

type DealValue =
  | { quotedAmountEtb?: string; contractAmountEtb?: string }
  | undefined;

/**
 * Quotations were dropped, so the deal value is captured here instead.
 * ponytail: window.prompt is the whole UI — swap for a drawer field if reps
 * find it clumsy.
 */
const promptForDealValue = (
  project: Project,
  next: ProjectStatus,
): DealValue | typeof CANCELLED | typeof INVALID => {
  const field = AMOUNT_FIELD[next as keyof typeof AMOUNT_FIELD];
  if (!field) {
    return undefined;
  }
  const entered = window.prompt(
    next === 'QUOTATION'
      ? `Price offered to the customer for "${project.name}" (ETB). Leave blank to skip.`
      : `Signed contract value for "${project.name}" (ETB). Leave blank to skip.`,
    (next === 'QUOTATION' ? project.quotedAmountEtb : project.contractAmountEtb) ??
      project.quotedAmountEtb ??
      '',
  );
  if (entered === null) {
    return CANCELLED;
  }
  const trimmed = entered.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!ETB_AMOUNT.test(trimmed)) {
    return INVALID;
  }
  return { [field]: trimmed };
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
  /**
   * `?customerId=` — how "View all" from a customer's page arrives. `null`
   * means the URL has not been read yet (that only happens in an effect, to
   * keep server and first client render identical), and the list holds off
   * loading until it has, so the unfiltered set is never fetched and then
   * replaced.
   */
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(
    async (
      nextPage: number,
      status: ProjectStatus | '',
      size: number,
      customerId: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [projectPage, customerPage] = await Promise.all([
          listProjects({
            status: status || undefined,
            customerId: customerId || undefined,
            page: nextPage,
            pageSize: size,
          }),
          optional(listCustomers({ page: 1, pageSize: 100 })),
        ]);
        setProjects(projectPage.items);
        setPage(projectPage.page);
        setTotal(projectPage.total);
        setTotalPages(projectPage.totalPages);
        setCustomerMap(
          Object.fromEntries(
            customerPage.items.map((c) => [c.id, c.name] as const),
          ),
        );
        // The rows just changed underneath the selection; keeping it would
        // point a bulk action at records nobody can see.
        setSelected(new Set());
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
    setCustomerFilter(
      new URLSearchParams(window.location.search).get('customerId') ?? '',
    );
  }, []);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    if (customerFilter === null) {
      return;
    }
    void refresh(page, statusFilter, pageSize, customerFilter);
  }, [router, refresh, page, statusFilter, pageSize, customerFilter]);

  const setFilter = (next: ProjectStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const clearCustomerFilter = () => {
    setPage(1);
    setCustomerFilter('');
    router.replace('/projects', { scroll: false });
  };

  const onAdvance = async (project: Project, next: ProjectStatus) => {
    const amounts = promptForDealValue(project, next);
    if (amounts === CANCELLED) {
      return;
    }
    if (amounts === INVALID) {
      setError('Amount must be a number with up to 2 decimals, e.g. 172345.21');
      return;
    }

    setAdvancingId(project.id);
    setError(null);
    try {
      await updateProjectStatus(project.id, next, amounts);
      await refresh(page, statusFilter, pageSize, customerFilter ?? '');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Status update failed',
      );
    } finally {
      setAdvancingId(null);
    }
  };

  const onExportSelected = () => {
    const rows = projects.filter((project) => selected.has(project.id));
    saveCsv(
      'projects.csv',
      csvRows([
        CSV_HEADERS,
        ...rows.map((project) => [
          project.name,
          customerMap[project.customerId] ?? project.customerId,
          project.siteCity ?? '',
          STATUS_LABEL[project.status],
          project.contractAmountEtb ?? project.quotedAmountEtb ?? '',
        ]),
      ]),
    );
  };

  const columns: ColumnDef<Project, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Project',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">{row.original.name}</span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) =>
        customerMap[row.original.customerId] ??
        row.original.customerId.slice(0, 8),
    },
    {
      id: 'city',
      header: 'City',
      cell: ({ row }) => row.original.siteCity ?? '\u2014',
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: ({ row }) => (
        <StatusPill
          label={STATUS_LABEL[row.original.status]}
          tone={STAGE_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'value',
      header: 'Value',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const amount =
          row.original.contractAmountEtb ?? row.original.quotedAmountEtb;
        return amount ? formatEtb(amount) : '\u2014';
      },
    },
    updatedColumn<Project>((row) => row.updatedAt),
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const project = row.original;
        const next = NEXT_PROJECT_STATUSES[project.status];
        if (next.length === 0) {
          return <span className="text-xs text-slate-400">Terminal</span>;
        }
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                disabled={advancingId === project.id}
                onClick={() => void onAdvance(project, s)}
                className={
                  s === 'CANCELLED'
                    ? `${btnGhost} px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 hover:text-red-700`
                    : `${btnSecondary} px-2.5 py-1 text-xs`
                }
              >
                → {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title="Project pipeline"
          description="Every deal from LEAD to COMPLETED. Advancing a project here is what unlocks its quotation and invoice."
          actions={
            <Link href="/customers" className={btnGhost}>
              Customers
            </Link>
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <ListToolbar
            filters={
              <>
                <FilterSelect<ProjectStatus>
                  label="Stage"
                  value={statusFilter}
                  onChange={setFilter}
                  options={STAGE_FILTERS.map((s) => ({
                    value: s,
                    label: STATUS_LABEL[s],
                  }))}
                  allLabel="All stages"
                />
                {customerFilter ? (
                  <FilterNotice
                    label={customerMap[customerFilter] ?? 'One customer'}
                    onClear={clearCustomerFilter}
                  />
                ) : null}
              </>
            }
            actions={
              <Link href="/projects/new" className={btnPrimary}>
                Create project
              </Link>
            }
          />

          <DataTable
            caption="Project pipeline"
            columns={columns}
            rows={projects}
            getRowId={(project) => project.id}
            getRowLabel={(project) => project.name}
            loading={loading}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            // Projects are append-only — the pipeline is the audit trail, so
            // the only safe bulk verb here is taking the rows away with you.
            bulkActions={
              <button
                type="button"
                onClick={onExportSelected}
                className={`${btnSecondary} px-2.5 py-1 text-xs`}
              >
                Export selected
              </button>
            }
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
              <div className="space-y-3">
                <p>
                  {statusFilter
                    ? `No project sits at ${STATUS_LABEL[statusFilter]}. Choose All stages to see every stage.`
                    : 'No projects yet. Create one against a customer from Customers, and it starts at LEAD.'}
                </p>
                <Link href="/projects/new" className={btnSecondary}>
                  Create project
                </Link>
              </div>
            }
          />
        </main>
      </div>
    </div>
  );
}
