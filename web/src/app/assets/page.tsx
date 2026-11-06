'use client';

import { updatedColumn } from '@/components/updated-column';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';

import { btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import {
  FilterNotice,
  FilterSelect,
  ListToolbar,
  RowAction,
  SearchField,
  StatusPill,
} from '@/components/list-toolbar';
import { Check, ClipboardCheck, Pencil, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { useConfirm } from '@/components/use-confirm';
import { csvRows, saveCsv } from '@/app/employees/csv';
import {
  ApiError,
  apiFetch,
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  getAccessToken,
  getCurrentRole,
  listAssets,
  listCustomers,
  moveAsset,
  optional,
  setAssetSoldTo,
  type AssetCategory,
  type AssetListItem,
  type AssetStatus,
  type UserRole,
} from '@/lib/api';
import { AssignCustomerDialog } from './assign-customer-dialog';
import {
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_TONE,
  assetMoveLabel,
  canAssignCustomer,
  forwardMove,
  moveWaitsForCustomer,
} from './labels';

/** DELETE /assets/:id — a soft delete on the server, the only other real
 *  delete in the product besides customers. */
const deleteAsset = (id: string): Promise<void> =>
  apiFetch<void>(`/assets/${id}`, { method: 'DELETE' });

/** Mirrors @Roles('SALES_MANAGER', 'TECHNICAL_MANAGER') on the assets
 *  PATCH/DELETE routes; CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWriteAssets = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' ||
  role === 'TECHNICAL_MANAGER' ||
  role === 'MAINTENANCE_ENGINEER' ||
  role === 'STORE_KEEPER' ||
  role === 'CEO' ||
  role === 'GENERAL_MANAGER' ||
  role === 'ADMIN';

type SoldFilter = 'sold' | 'stock';

const SOLD_FILTER_LABEL: Record<SoldFilter, string> = {
  sold: 'Sold',
  stock: 'In stock',
};

const CSV_HEADERS = [
  'Name',
  'Serial number',
  'Category',
  'Sold to',
  'Building',
  'Status',
] as const;

export default function AssetsPage() {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [soldFilter, setSoldFilter] = useState<SoldFilter | ''>('');
  /** `?customerId=` — "View all" from a customer's page. `null` until the URL
   *  has been read in an effect; the first load waits for it rather than
   *  fetching every asset and replacing the list a moment later. */
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** The row whose Delete is armed. Confirm swaps the icons in place. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The lift whose Assign customer is open. */
  const [assigning, setAssigning] = useState<AssetListItem | null>(null);
  const canWrite = canWriteAssets(role);

  const refresh = useCallback(
    async (
      nextPage: number,
      size: number,
      q: string,
      categoryValue: AssetCategory | '',
      customerId: string,
      statusValue: AssetStatus | '',
      soldValue: SoldFilter | '',
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [assetPage, customerPage] = await Promise.all([
          listAssets({
            q,
            category: categoryValue || undefined,
            customerId: customerId || undefined,
            status: statusValue || undefined,
            sold: soldValue ? soldValue === 'sold' : undefined,
            page: nextPage,
            pageSize: size,
          }),
          optional(listCustomers({ page: 1, pageSize: 100 })),
        ]);
        setAssets(assetPage.items);
        setPage(assetPage.page);
        setTotal(assetPage.total);
        setTotalPages(assetPage.totalPages);
        setCustomerMap(
          Object.fromEntries(
            customerPage.items.map((c) => [c.id, c.name] as const),
          ),
        );
        // The rows just changed underneath the selection; keeping it would
        // point a bulk action at records nobody can see.
        setSelected(new Set());
        setConfirmingId(null);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load assets',
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
    setRole(getCurrentRole());
    if (customerFilter === null) {
      return;
    }
    void refresh(
      page,
      pageSize,
      search,
      categoryFilter,
      customerFilter,
      statusFilter,
      soldFilter,
    );
  }, [
    router,
    refresh,
    page,
    pageSize,
    search,
    categoryFilter,
    customerFilter,
    statusFilter,
    soldFilter,
  ]);

  const onSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearCustomerFilter = () => {
    setPage(1);
    setCustomerFilter('');
    router.replace('/assets', { scroll: false });
  };

  const onDelete = async (asset: AssetListItem) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      setConfirmingId(null);
      await refresh(
        page,
        pageSize,
        search,
        categoryFilter,
        customerFilter ?? '',
        statusFilter,
        soldFilter,
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not delete ${asset.name}`,
      );
    } finally {
      setBusy(false);
    }
  };

  /** Runs one change to a lift, then shows what the server now holds. */
  const changeLift = async (
    change: () => Promise<unknown>,
    fallback: string,
  ) => {
    setBusy(true);
    setError(null);
    let problem: string | null = null;
    try {
      await change();
    } catch (err) {
      problem = err instanceof ApiError ? err.message : fallback;
    }
    await refresh(
      page,
      pageSize,
      search,
      categoryFilter,
      customerFilter ?? '',
      statusFilter,
      soldFilter,
    );
    if (problem) {
      setError(problem);
    }
    setBusy(false);
  };

  const onMove = async (asset: AssetListItem, to: AssetStatus) => {
    const label = assetMoveLabel(asset.status, to);
    const short = asset.shortParts;
    // A store keeper cannot undo a step, and a table is an easy place to mis-tap.
    if (
      (await confirm({
        title: `${label}?`,
        description:
          short > 0
            ? `${asset.name} still has ${short} ${short === 1 ? 'part' : 'parts'} missing.`
            : asset.name,
        confirmLabel: label,
      })) === null
    ) {
      return;
    }
    await changeLift(() => moveAsset(asset.id, to), `${label} did not work.`);
  };

  const onAssign = async (asset: AssetListItem, customerId: string | null) => {
    setAssigning(null);
    await changeLift(
      () => setAssetSoldTo(asset.id, customerId),
      'The customer could not be assigned.',
    );
  };

  const onBulkDelete = async () => {
    const ids = [...selected];
    if (
      (await confirm({
        title: `Delete ${ids.length} asset${ids.length === 1 ? '' : 's'}?`,
        description: 'Contracts and work orders referencing them stay put.',
        confirmLabel: 'Delete',
        tone: 'danger',
      })) === null
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    // No bulk endpoint exists, so this is N calls. Report the real tally
    // rather than pretending the loop was one atomic delete.
    const results = await Promise.allSettled(ids.map((id) => deleteAsset(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBusy(false);
    await refresh(
      page,
      pageSize,
      search,
      categoryFilter,
      customerFilter ?? '',
      statusFilter,
      soldFilter,
    );
    if (failed > 0) {
      setError(
        `Deleted ${ids.length - failed} of ${ids.length}. ${failed} could not be deleted.`,
      );
    }
  };

  const onExportSelected = () => {
    const rows = assets.filter((a) => selected.has(a.id));
    saveCsv(
      'assets.csv',
      csvRows([
        CSV_HEADERS,
        ...rows.map((a) => [
          a.name,
          a.serialNumber ?? '',
          ASSET_CATEGORY_LABEL[a.category],
          a.customerName ?? 'In stock',
          a.buildingName ?? '',
          ASSET_STATUS_LABEL[a.status],
        ]),
      ]),
    );
  };

  /** The one thing to do next on a lift, or who it is waiting for. */
  const nextStep = (asset: AssetListItem) => {
    const to = forwardMove(asset.status, asset.nextMoves);
    if (!to) {
      return null;
    }
    if (moveWaitsForCustomer(to, asset.customerId)) {
      return canAssignCustomer(role, asset.status) ? (
        <span className="text-xs font-semibold text-amber-700">
          Assign a customer first
        </span>
      ) : (
        <span className="block max-w-44 text-xs text-slate-600">
          <span className="block font-semibold text-amber-700">
            Waiting for a customer
          </span>
          Sales or the General Manager assigns it
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => void onMove(asset, to)}
        className={`${btnPrimary} whitespace-nowrap px-3 py-1.5`}
      >
        {assetMoveLabel(asset.status, to)}
      </button>
    );
  };

  const columns: ColumnDef<AssetListItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => (
        <>
          <span className="font-medium text-slate-900">
            {row.original.name}
          </span>
          {row.original.serialNumber ? (
            <span className="mt-0.5 block font-mono text-xs font-normal text-slate-500">
              {row.original.serialNumber}
            </span>
          ) : null}
          {/* On a phone the table scrolls sideways, which would hide the column. */}
          <span className="mt-2 block empty:hidden sm:hidden">
            {nextStep(row.original)}
          </span>
        </>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill
            label={ASSET_STATUS_LABEL[row.original.status]}
            tone={ASSET_STATUS_TONE[row.original.status]}
          />
          {row.original.shortParts > 0 ? (
            <StatusPill
              label={`${row.original.shortParts} missing`}
              tone="warn"
            />
          ) : null}
        </span>
      ),
    },
    {
      id: 'nextStep',
      header: 'Next step',
      cell: ({ row }) => (
        <span className="hidden sm:block">
          {nextStep(row.original) ?? <span className="text-slate-400">—</span>}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'Sold to',
      cell: ({ row }) => {
        const asset = row.original;
        if (asset.customerName) {
          return asset.customerName;
        }
        return canAssignCustomer(role, asset.status) ? (
          <span className="flex flex-wrap items-center gap-2">
            In stock
            <button
              type="button"
              disabled={busy}
              onClick={() => setAssigning(asset)}
              className={`${btnSecondary} whitespace-nowrap px-2.5 py-1 text-xs`}
            >
              Assign customer
            </button>
          </span>
        ) : (
          'In stock'
        );
      },
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => ASSET_CATEGORY_LABEL[row.original.category],
    },
    {
      id: 'building',
      header: 'Building',
      cell: ({ row }) => row.original.buildingName ?? '—',
    },
    updatedColumn<AssetListItem>((row) => row.updatedAt),
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const asset = row.original;
        if (confirmingId === asset.id) {
          return (
            <div className="flex items-center justify-end gap-0.5">
              <RowAction
                icon={Check}
                tone="danger"
                disabled={busy}
                label={`Confirm deleting ${asset.name}`}
                onClick={() => void onDelete(asset)}
              />
              <RowAction
                icon={X}
                disabled={busy}
                label={`Keep ${asset.name}`}
                onClick={() => setConfirmingId(null)}
              />
            </div>
          );
        }
        return (
          <div className="flex items-center justify-end gap-0.5">
            <RowAction
              icon={ClipboardCheck}
              label={`Parts and status of ${asset.name}`}
              onClick={() => router.push(`/assets/${asset.id}/checklist`)}
            />
            {canWrite ? (
              <>
                <RowAction
                  icon={Pencil}
                  label={`Edit ${asset.name}`}
                  onClick={() => router.push(`/assets/${asset.id}/edit`)}
                />
                <RowAction
                  icon={Trash2}
                  tone="danger"
                  label={`Delete ${asset.name}`}
                  onClick={() => setConfirmingId(asset.id)}
                />
              </>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {confirmDialog}
      {assigning ? (
        <AssignCustomerDialog
          liftName={assigning.name}
          hasCustomer={false}
          onPick={(customerId) => void onAssign(assigning, customerId)}
          onClose={() => setAssigning(null)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Operations"
          title="Assets"
          description="Every elevator, escalator and machine: where it is, and who it is sold to."
          actions={
            <button
              type="button"
              onClick={() => router.push('/assets/new')}
              className={btnPrimary}
            >
              Register asset
            </button>
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <ListToolbar
            search={
              <SearchField
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={onSearch}
                placeholder="Name, serial, or building"
              />
            }
            filters={
              <>
                <FilterSelect
                  label="Category"
                  value={categoryFilter}
                  onChange={(value) => {
                    setPage(1);
                    setCategoryFilter(value);
                  }}
                  options={ASSET_CATEGORIES.map((value) => ({
                    value,
                    label: ASSET_CATEGORY_LABEL[value],
                  }))}
                  allLabel="All categories"
                />
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={(value) => {
                    setPage(1);
                    setStatusFilter(value);
                  }}
                  options={ASSET_STATUSES.map((value) => ({
                    value,
                    label: ASSET_STATUS_LABEL[value],
                  }))}
                  allLabel="All statuses"
                />
                <FilterSelect
                  label="Sold to"
                  value={soldFilter}
                  onChange={(value) => {
                    setPage(1);
                    setSoldFilter(value);
                  }}
                  options={(['sold', 'stock'] as const).map((value) => ({
                    value,
                    label: SOLD_FILTER_LABEL[value],
                  }))}
                  allLabel="Sold and in stock"
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
              <button type="button" onClick={onSearch} className={btnSecondary}>
                Search
              </button>
            }
          />

          <DataTable
            caption="Assets"
            columns={columns}
            rows={assets}
            getRowId={(asset) => asset.id}
            getRowLabel={(asset) => asset.name}
            loading={loading}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={
              <>
                <button
                  type="button"
                  onClick={onExportSelected}
                  className={`${btnSecondary} px-2.5 py-1 text-xs`}
                >
                  Export selected
                </button>
                {canWrite ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onBulkDelete()}
                    className={`${btnSecondary} px-2.5 py-1 text-xs text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                  >
                    Delete selected
                  </button>
                ) : null}
              </>
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
              search || categoryFilter || statusFilter || soldFilter ? (
                <>
                  No asset matches these filters. Clear the search and set each
                  filter back to All.
                </>
              ) : (
                <>
                  No assets registered. Register the equipment here first — a
                  maintenance contract on Maintenance needs an asset to attach
                  to.
                </>
              )
            }
          />
        </main>
      </div>
    </div>
  );
}
