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
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { csvRows, saveCsv } from '@/app/employees/csv';
import {
  ApiError,
  apiFetch,
  ASSET_CATEGORIES,
  getAccessToken,
  getCurrentRole,
  listAssets,
  listCustomers,
  optional,
  type Asset,
  type AssetCategory,
  type UserRole,
} from '@/lib/api';
import {
  ASSET_CATEGORY_LABEL,
  ASSET_STATUS_LABEL,
  ASSET_STATUS_TONE,
} from './labels';

/** DELETE /assets/:id — a soft delete on the server, the only other real
 *  delete in the product besides customers. */
const deleteAsset = (id: string): Promise<void> =>
  apiFetch<void>(`/assets/${id}`, { method: 'DELETE' });

/** Mirrors @Roles('SALES_MANAGER', 'TECHNICAL_LEAD') on the assets
 *  PATCH/DELETE routes; CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWriteAssets = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' ||
  role === 'TECHNICAL_LEAD' ||
  role === 'CEO' ||
  role === 'ADMIN';

const CSV_HEADERS = [
  'Name',
  'Serial number',
  'Category',
  'Customer',
  'Building',
  'Status',
] as const;

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
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
  const canWrite = canWriteAssets(role);

  const refresh = useCallback(
    async (
      nextPage: number,
      size: number,
      q: string,
      categoryValue: AssetCategory | '',
      customerId: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const [assetPage, customerPage] = await Promise.all([
          listAssets({
            q,
            category: categoryValue || undefined,
            customerId: customerId || undefined,
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
    void refresh(page, pageSize, search, categoryFilter, customerFilter);
  }, [router, refresh, page, pageSize, search, categoryFilter, customerFilter]);

  const onSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const clearCustomerFilter = () => {
    setPage(1);
    setCustomerFilter('');
    router.replace('/assets', { scroll: false });
  };

  const onDelete = async (asset: Asset) => {
    setBusy(true);
    setError(null);
    try {
      await deleteAsset(asset.id);
      setConfirmingId(null);
      await refresh(page, pageSize, search, categoryFilter, customerFilter ?? '');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Could not delete ${asset.name}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onBulkDelete = async () => {
    const ids = [...selected];
    if (
      !window.confirm(
        `Delete ${ids.length} asset${ids.length === 1 ? '' : 's'}? Contracts and work orders referencing them stay put.`,
      )
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
    await refresh(page, pageSize, search, categoryFilter, customerFilter ?? '');
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
          customerMap[a.customerId] ?? '',
          a.buildingName ?? '',
          ASSET_STATUS_LABEL[a.status],
        ]),
      ]),
    );
  };

  const columns: ColumnDef<Asset, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => (
        <>
          <span className="font-medium text-slate-900">{row.original.name}</span>
          {row.original.serialNumber ? (
            <span className="mt-0.5 block font-mono text-xs font-normal text-slate-500">
              {row.original.serialNumber}
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => ASSET_CATEGORY_LABEL[row.original.category],
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => customerMap[row.original.customerId] ?? '—',
    },
    {
      id: 'building',
      header: 'Building',
      cell: ({ row }) => row.original.buildingName ?? '—',
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={ASSET_STATUS_LABEL[row.original.status]}
          tone={ASSET_STATUS_TONE[row.original.status]}
        />
      ),
    },
    updatedColumn<Asset>((row) => row.updatedAt),
    ...(canWrite
      ? ([
          {
            id: 'actions',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => {
              const asset = row.original;
              return (
                <div className="flex items-center justify-end gap-0.5">
                  {confirmingId === asset.id ? (
                    <>
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
                    </>
                  ) : (
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
                  )}
                </div>
              );
            },
          },
        ] satisfies ColumnDef<Asset, unknown>[])
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Operations"
          title="Assets"
          description="Every elevator, escalator and machine under contract, registered against the customer that owns it."
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
              search || categoryFilter ? (
                <>No asset matches these filters. Clear the search and set Category to All categories.</>
              ) : (
                <>
                  No assets registered. Register the equipment here first — a
                  maintenance contract on Maintenance needs an asset to attach to.
                </>
              )
            }
          />
        </main>
      </div>
    </div>
  );
}
