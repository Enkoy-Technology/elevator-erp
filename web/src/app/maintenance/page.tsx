'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import {
  Ban,
  Check,
  CheckCircle2,
  ClipboardCheck,
  UserPlus,
  X,
} from 'lucide-react';

import { btnPrimary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import {
  FilterNotice,
  ListToolbar,
  RowAction,
  StatusPill,
} from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  getCurrentRole,
  listAssets,
  listBreakdowns,
  listMaintenanceContracts,
  updateBreakdown,
  updateMaintenanceContract,
  type Breakdown,
  type BreakdownSeverity,
  type BreakdownStatus,
  type MaintenanceContract,
  type UserRole,
  optional,
} from '@/lib/api';
import { csvRows, saveCsv } from '@/app/employees/csv';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

/** Bulk-bar button: matches the bar's own Clear control, not a page button. */
const bulkBtn =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium ' +
  'text-slate-700 transition hover:border-slate-400 hover:bg-slate-50';

/** CEO and ADMIN bypass every @Roles list via RolesGuard's SUPER_ROLES. */
const allows = (role: UserRole | null, allowed: readonly UserRole[]): boolean =>
  role !== null && (role === 'CEO' || role === 'GENERAL_MANAGER' || role === 'ADMIN' || allowed.includes(role));

/** Mirrors @Roles on PATCH /maintenance/contracts/:id. */
const CONTRACT_WRITE_ROLES: readonly UserRole[] = [
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'DISPATCHER',
  'SALES_MANAGER',
];
/** POST contracts/:id/visits and PATCH breakdowns/:id — no SALES_MANAGER. */
const FIELD_WRITE_ROLES: readonly UserRole[] = [
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'DISPATCHER',
];

/** Severity is the response clock, so it reads as colour, not as text. */
const SEVERITY_TONE: Record<
  BreakdownSeverity,
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  EMERGENCY: 'danger',
  CRITICAL: 'danger',
  HIGH: 'warn',
  MEDIUM: 'neutral',
  LOW: 'neutral',
};

const BREAKDOWN_STATUS_TONE: Record<
  BreakdownStatus,
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  OPEN: 'warn',
  ASSIGNED: 'active',
  DONE: 'good',
};

const CONTRACT_STATUS_TONE: Record<
  MaintenanceContract['status'],
  'neutral' | 'active' | 'good' | 'warn' | 'danger'
> = {
  ACTIVE: 'good',
  PAUSED: 'warn',
  ENDED: 'neutral',
};

export default function MaintenancePage() {
  const router = useRouter();
  const [tab, setTab] = useState<'contracts' | 'breakdowns'>('contracts');
  const [contracts, setContracts] = useState<MaintenanceContract[]>([]);
  const [breakdowns, setBreakdowns] = useState<Breakdown[]>([]);
  const [assetMap, setAssetMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  // Which row is mid-confirm; one at a time.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  /**
   * `?customerId=` — "View all" from a customer's page. `null` until the URL
   * has been read in an effect, and the first load waits for it.
   *
   * Contracts only: GET /maintenance/breakdowns takes no customerId, so the
   * breakdowns tab stays unfiltered (and shows no filter chip claiming
   * otherwise).
   */
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);

  const canWriteContracts = allows(role, CONTRACT_WRITE_ROLES);
  const canWorkField = allows(role, FIELD_WRITE_ROLES);

  const refresh = useCallback(
    async (
      nextTab: 'contracts' | 'breakdowns',
      nextPage: number,
      nextPageSize: number,
      customerId: string,
    ) => {
      setLoading(true);
      setError(null);
      // The rows behind the selection are about to be replaced; a selection
      // that outlives them would act on ids the user can no longer see.
      setSelectedIds(new Set());
      setConfirmId(null);
      try {
        const assetPage = await optional(listAssets({ page: 1, pageSize: 100 }));
        setAssetMap(
          Object.fromEntries(
            assetPage.items.map((a) => [a.id, a.name] as const),
          ),
        );

        if (nextTab === 'contracts') {
          const result = await listMaintenanceContracts({
            customerId: customerId || undefined,
            page: nextPage,
            pageSize: nextPageSize,
          });
          setContracts(result.items);
          setPage(result.page);
          setTotal(result.total);
          setTotalPages(result.totalPages);
        } else {
          const result = await listBreakdowns({
            page: nextPage,
            pageSize: nextPageSize,
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

  // Coming back from "Open breakdown" should land on the breakdowns tab, the
  // way closing the old drawer did. The hash is the cheapest way to carry
  // that across a real navigation.
  useEffect(() => {
    if (window.location.hash === '#breakdowns') {
      setTab('breakdowns');
    }
  }, []);

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
    setRole(getCurrentRole());
    if (customerFilter === null) {
      return;
    }
    void refresh(tab, page, pageSize, customerFilter);
  }, [router, refresh, tab, page, pageSize, customerFilter]);

  const clearCustomerFilter = () => {
    setPage(1);
    setCustomerFilter('');
    router.replace('/maintenance', { scroll: false });
  };

  const switchTab = (next: 'contracts' | 'breakdowns') => {
    setPage(1);
    setSelectedIds(new Set());
    setBulkNotice(null);
    setTab(next);
  };

  const assetName = (assetId: string): string =>
    assetMap[assetId] ?? assetId.slice(0, 8);

  const onAdvanceBreakdown = async (
    item: Breakdown,
    status: BreakdownStatus,
  ) => {
    try {
      await updateBreakdown(item.id, { status });
      await refresh('breakdowns', page, pageSize, customerFilter ?? '');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to update breakdown',
      );
    }
  };

  const endContract = async (contract: MaintenanceContract) => {
    setConfirmId(null);
    try {
      await updateMaintenanceContract(contract.id, { status: 'ENDED' });
      await refresh('contracts', page, pageSize, customerFilter ?? '');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to end contract',
      );
    }
  };

  const selectedContracts = contracts.filter((c) => selectedIds.has(c.id));
  const selectedBreakdowns = breakdowns.filter((b) => selectedIds.has(b.id));

  const exportContracts = () => {
    saveCsv(
      'maintenance-contracts-selected.csv',
      csvRows([
        ['Asset', 'Recurrence', 'Status', 'Next service', 'Last service'],
        ...selectedContracts.map((c) => [
          assetName(c.assetId),
          c.recurrence,
          c.status,
          c.nextServiceAt,
          c.lastServiceAt ?? '',
        ]),
      ]),
    );
  };

  const exportBreakdowns = () => {
    saveCsv(
      'maintenance-breakdowns-selected.csv',
      csvRows([
        ['Title', 'Asset', 'Severity', 'Status', 'Opened'],
        ...selectedBreakdowns.map((b) => [
          b.title,
          assetName(b.assetId),
          b.severity,
          b.status,
          b.createdAt,
        ]),
      ]),
    );
  };

  const endSelectedContracts = async () => {
    const targets = selectedContracts.filter((c) => c.status !== 'ENDED');
    if (targets.length === 0) {
      setBulkNotice('Every selected contract has already ended.');
      return;
    }
    if (
      !window.confirm(
        `End ${targets.length} contract(s)? They stop generating service visits.`,
      )
    ) {
      return;
    }
    setBulkNotice(null);
    // No bulk endpoint exists — this is N PATCHes, so it is NOT atomic and a
    // partial failure is reported as one rather than dressed up as success.
    const results = await Promise.allSettled(
      targets.map((c) => updateMaintenanceContract(c.id, { status: 'ENDED' })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBulkNotice(
      failed === 0
        ? `Ended ${targets.length} contract(s).`
        : `Ended ${targets.length - failed} of ${targets.length}. ${failed} failed and are still running — try those again.`,
    );
    await refresh('contracts', page, pageSize, customerFilter ?? '');
  };

  const completeSelectedBreakdowns = async () => {
    const targets = selectedBreakdowns.filter((b) => b.status !== 'DONE');
    if (targets.length === 0) {
      setBulkNotice('Every selected ticket is already done.');
      return;
    }
    if (!window.confirm(`Mark ${targets.length} ticket(s) done?`)) {
      return;
    }
    setBulkNotice(null);
    const results = await Promise.allSettled(
      targets.map((b) => updateBreakdown(b.id, { status: 'DONE' })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBulkNotice(
      failed === 0
        ? `Closed ${targets.length} ticket(s).`
        : `Closed ${targets.length - failed} of ${targets.length}. ${failed} failed and are still open — try those again.`,
    );
    await refresh('breakdowns', page, pageSize, customerFilter ?? '');
  };

  const today = todayIso();

  const contractColumns: ColumnDef<MaintenanceContract, unknown>[] = [
    {
      id: 'asset',
      header: 'Asset',
      enableSorting: true,
      accessorFn: (c) => assetMap[c.assetId] ?? c.assetId.slice(0, 8),
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-900">{getValue<string>()}</span>
      ),
    },
    { accessorKey: 'recurrence', header: 'Recurrence' },
    {
      id: 'nextServiceAt',
      header: 'Next service',
      cell: ({ row }) => {
        // Overdue is the only thing on this page that needs chasing today.
        const overdue =
          row.original.status === 'ACTIVE' && row.original.nextServiceAt < today;
        return (
          <span className="flex items-center gap-2">
            <span
              className={`font-mono text-xs ${overdue ? 'font-semibold text-red-700' : 'text-slate-700'}`}
            >
              {row.original.nextServiceAt}
            </span>
            {overdue ? <StatusPill label="Overdue" tone="danger" /> : null}
          </span>
        );
      },
    },
    {
      id: 'lastServiceAt',
      header: 'Last',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600">
          {row.original.lastServiceAt ?? '—'}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={row.original.status}
          tone={CONTRACT_STATUS_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const contract = row.original;
        const label = assetName(contract.assetId);
        return (
          <div className="flex items-center justify-end gap-0.5">
            {canWorkField && contract.status === 'ACTIVE' ? (
              <RowAction
                icon={ClipboardCheck}
                label={`Log a service visit on ${label}`}
                onClick={() =>
                  router.push(`/maintenance/contracts/${contract.id}/visit`)
                }
              />
            ) : null}
            {/* A contract is never deleted — its visits are the service
                history. Ending it is the destructive action that exists. */}
            {canWriteContracts && contract.status !== 'ENDED' ? (
              confirmId === contract.id ? (
                <>
                  <RowAction
                    icon={Check}
                    tone="danger"
                    label={`Confirm ending the contract on ${label}`}
                    onClick={() => void endContract(contract)}
                  />
                  <RowAction
                    icon={X}
                    label={`Keep the contract on ${label} running`}
                    onClick={() => setConfirmId(null)}
                  />
                </>
              ) : (
                <RowAction
                  icon={Ban}
                  tone="danger"
                  label={`End the contract on ${label}`}
                  onClick={() => setConfirmId(contract.id)}
                />
              )
            ) : null}
          </div>
        );
      },
    },
  ];

  const breakdownColumns: ColumnDef<Breakdown, unknown>[] = [
    {
      accessorKey: 'title',
      header: 'Title',
      enableSorting: true,
      cell: ({ getValue }) => (
        <span className="font-medium text-slate-900">{getValue<string>()}</span>
      ),
    },
    {
      id: 'asset',
      header: 'Asset',
      cell: ({ row }) => assetMap[row.original.assetId] ?? '—',
    },
    {
      id: 'severity',
      header: 'Severity',
      cell: ({ row }) => (
        <StatusPill
          label={row.original.severity}
          tone={SEVERITY_TONE[row.original.severity]}
        />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={row.original.status}
          tone={BREAKDOWN_STATUS_TONE[row.original.status]}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      // A ticket has no delete and no cancel in the API: DONE is the only
      // way out, so these two are the whole set of real actions.
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          {canWorkField && row.original.status === 'OPEN' ? (
            <RowAction
              icon={UserPlus}
              label={`Assign ${row.original.title}`}
              onClick={() => void onAdvanceBreakdown(row.original, 'ASSIGNED')}
            />
          ) : null}
          {canWorkField && row.original.status !== 'DONE' ? (
            <RowAction
              icon={CheckCircle2}
              label={`Mark ${row.original.title} done`}
              onClick={() => void onAdvanceBreakdown(row.original, 'DONE')}
            />
          ) : null}
        </div>
      ),
    },
  ];

  const tabClass = (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium ${
      active ? 'bg-navy-800 text-white' : 'border border-slate-200 text-slate-600'
    }`;

  const pagination = {
    page,
    pageSize,
    total,
    totalPages,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Operations"
          title="Maintenance"
          description="Service contracts and the breakdowns they generate. Logging a visit rolls the contract to its next service date."
          actions={
            tab === 'contracts' ? (
              <Link href="/maintenance/contracts/new" className={btnPrimary}>
                New contract
              </Link>
            ) : (
              <Link href="/maintenance/breakdowns/new" className={btnPrimary}>
                Open breakdown
              </Link>
            )
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {/* Two different records, not two filters of one list — so this
              stays a view switch and does not become a FilterSelect. */}
          <ListToolbar
            filters={
              <>
                <div className="flex gap-2" role="tablist" aria-label="Maintenance view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'contracts'}
                    onClick={() => switchTab('contracts')}
                    className={tabClass(tab === 'contracts')}
                  >
                    Contracts
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === 'breakdowns'}
                    onClick={() => switchTab('breakdowns')}
                    className={tabClass(tab === 'breakdowns')}
                  >
                    Breakdowns
                  </button>
                </div>
                {customerFilter && tab === 'contracts' ? (
                  <FilterNotice label="One customer" onClear={clearCustomerFilter} />
                ) : null}
              </>
            }
          />

          {bulkNotice ? (
            <p className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {bulkNotice}
            </p>
          ) : null}

          {tab === 'contracts' ? (
            <DataTable
              caption="Maintenance contracts"
              columns={contractColumns}
              rows={contracts}
              getRowId={(c) => c.id}
              loading={loading}
              pagination={pagination}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              getRowLabel={(c) => `the contract on ${assetName(c.assetId)}`}
              bulkActions={
                <>
                  <button type="button" onClick={exportContracts} className={bulkBtn}>
                    Export selected
                  </button>
                  {canWriteContracts ? (
                    <button
                      type="button"
                      onClick={() => void endSelectedContracts()}
                      className={bulkBtn}
                    >
                      End selected
                    </button>
                  ) : null}
                </>
              }
              empty={
                <>
                  No maintenance contracts yet. Register the equipment on Assets
                  first, then start a contract with New contract above.
                </>
              }
            />
          ) : (
            <DataTable
              caption="Breakdown tickets"
              columns={breakdownColumns}
              rows={breakdowns}
              getRowId={(b) => b.id}
              loading={loading}
              pagination={pagination}
              selectable
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              getRowLabel={(b) => b.title}
              bulkActions={
                <>
                  <button type="button" onClick={exportBreakdowns} className={bulkBtn}>
                    Export selected
                  </button>
                  {canWorkField ? (
                    <button
                      type="button"
                      onClick={() => void completeSelectedBreakdowns()}
                      className={bulkBtn}
                    >
                      Mark selected done
                    </button>
                  ) : null}
                </>
              }
              empty={
                <>
                  No breakdown tickets. Open one with Open breakdown above when a
                  customer reports a fault — severity sets the response clock.
                </>
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}
