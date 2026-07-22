'use client';

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
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  createAsset,
  getAccessToken,
  listAssets,
  listCustomers,
  updateAsset,
  type Asset,
  type AssetCategory,
  type AssetStatus,
  type Customer,
} from '@/lib/api';

const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  ELEVATOR: 'Elevator',
  STAIRS: 'Stairs',
  OTHER: 'Other',
};

const STATUS_LABEL: Record<AssetStatus, string> = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  DECOMMISSIONED: 'Decommissioned',
};

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMap, setCustomerMap] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<AssetCategory | ''>('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [category, setCategory] = useState<AssetCategory>('ELEVATOR');
  const [name, setName] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [locationNotes, setLocationNotes] = useState('');
  const [status, setStatus] = useState<AssetStatus>('ACTIVE');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(
    async (nextPage: number, q: string, categoryValue: AssetCategory | '') => {
      setLoading(true);
      setError(null);
      try {
        const [assetPage, customerPage] = await Promise.all([
          listAssets({
            q,
            category: categoryValue || undefined,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
          listCustomers({ page: 1, pageSize: 100 }),
        ]);
        setAssets(assetPage.items);
        setPage(assetPage.page);
        setTotal(assetPage.total);
        setTotalPages(assetPage.totalPages);
        setCustomers(customerPage.items);
        setCustomerMap(
          Object.fromEntries(
            customerPage.items.map((c) => [c.id, c.name] as const),
          ),
        );
        setCustomerId((prev) => prev || customerPage.items[0]?.id || '');
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
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    void refresh(page, search, categoryFilter);
  }, [router, refresh, page, search, categoryFilter]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetForm = () => {
    setEditId(null);
    setCategory('ELEVATOR');
    setName('');
    setBuildingName('');
    setSerialNumber('');
    setLocationNotes('');
    setStatus('ACTIVE');
    setNotes('');
    setFormError(null);
    setCustomerId(customers[0]?.id || '');
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditId(asset.id);
    setCustomerId(asset.customerId);
    setCategory(asset.category);
    setName(asset.name);
    setBuildingName(asset.buildingName ?? '');
    setSerialNumber(asset.serialNumber ?? '');
    setLocationNotes(asset.locationNotes ?? '');
    setStatus(asset.status);
    setNotes(asset.notes ?? '');
    setFormError(null);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editId && !customerId) {
      setFormError('Create a customer first, then register an asset.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      if (editId) {
        await updateAsset(editId, {
          category,
          name,
          buildingName: buildingName || null,
          serialNumber: serialNumber || null,
          locationNotes: locationNotes || null,
          status,
          notes: notes || null,
        });
      } else {
        await createAsset({
          customerId,
          category,
          name,
          buildingName: buildingName || undefined,
          serialNumber: serialNumber || undefined,
          locationNotes: locationNotes || undefined,
          notes: notes || undefined,
        });
      }
      closeDrawer();
      setPage(1);
      setSearch('');
      setSearchInput('');
      setCategoryFilter('');
      await refresh(1, '', '');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to save asset',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Assets</h1>
              <p className="text-sm text-slate-500">
                Register elevators, stairs, and other equipment by customer
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-navy-700"
            >
              Register asset
            </button>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <form
              onSubmit={onSearch}
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[200px] flex-1">
                <label className={labelClass} htmlFor="search">
                  Search
                </label>
                <input
                  id="search"
                  className={fieldClass}
                  placeholder="Name, serial, or building"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <div className="min-w-[160px]">
                <label className={labelClass} htmlFor="categoryFilter">
                  Category
                </label>
                <select
                  id="categoryFilter"
                  className={fieldClass}
                  value={categoryFilter}
                  onChange={(e) => {
                    setPage(1);
                    setCategoryFilter(
                      e.target.value as AssetCategory | '',
                    );
                  }}
                >
                  <option value="">All</option>
                  {ASSET_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_LABEL[value]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-navy-600 hover:text-navy-800"
              >
                Search
              </button>
            </form>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No assets yet.</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Register your first asset
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Name</th>
                        <th className="py-2 pr-4 font-semibold">Category</th>
                        <th className="py-2 pr-4 font-semibold">Customer</th>
                        <th className="py-2 pr-4 font-semibold">Building</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((asset) => (
                        <tr
                          key={asset.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {asset.name}
                            {asset.serialNumber ? (
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                {asset.serialNumber}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {CATEGORY_LABEL[asset.category]}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {customerMap[asset.customerId] ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {asset.buildingName ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {STATUS_LABEL[asset.status]}
                          </td>
                          <td className="py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(asset)}
                              className="text-sm font-semibold text-navy-800 hover:underline"
                            >
                              Edit
                            </button>
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
        open={drawerOpen}
        onClose={closeDrawer}
        title={editId ? 'Edit asset' : 'Register asset'}
        description="Link equipment to a customer. Categories: elevator, stairs, or other."
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
              form="asset-form"
              disabled={submitting}
              className="flex-1 rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : editId ? 'Save changes' : 'Register'}
            </button>
          </div>
        }
      >
        <form
          id="asset-form"
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          {!editId ? (
            <div>
              <label className={labelClass} htmlFor="customerId">
                Customer
              </label>
              <select
                id="customerId"
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
          ) : null}

          <div>
            <label className={labelClass} htmlFor="category">
              Category
            </label>
            <select
              id="category"
              className={fieldClass}
              value={category}
              onChange={(e) => setCategory(e.target.value as AssetCategory)}
            >
              {ASSET_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className={fieldClass}
              required
              minLength={2}
              autoFocus
              placeholder="Lift A — Lobby"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="buildingName">
              Building
            </label>
            <input
              id="buildingName"
              className={fieldClass}
              value={buildingName}
              onChange={(e) => setBuildingName(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="serialNumber">
              Serial number
            </label>
            <input
              id="serialNumber"
              className={fieldClass}
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="locationNotes">
              Location notes
            </label>
            <input
              id="locationNotes"
              className={fieldClass}
              value={locationNotes}
              onChange={(e) => setLocationNotes(e.target.value)}
            />
          </div>

          {editId ? (
            <div>
              <label className={labelClass} htmlFor="status">
                Status
              </label>
              <select
                id="status"
                className={fieldClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as AssetStatus)}
              >
                {ASSET_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              className={fieldClass}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
