'use client';

import Link from 'next/link';
import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import { btnDanger, btnGhost, btnPrimary, btnSecondary, fieldClass, labelClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { SideDrawer } from '@/components/side-drawer';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  checkCustomerDuplicate,
  createCustomer,
  deleteCustomer,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  updateCustomer,
  type Customer,
  type CustomerType,
  type SimilarCustomer,
  type UserRole,
} from '@/lib/api';

const PAGE_SIZE = 20;

/** Mirrors @Roles('SALES_MANAGER') on the customers PATCH/DELETE routes;
 *  CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWriteCustomers = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [customerType, setCustomerType] =
    useState<CustomerType>('COMMERCIAL');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [similar, setSimilar] = useState<SimilarCustomer[]>([]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const canWrite = canWriteCustomers(role);

  const refresh = useCallback(async (nextPage: number, q: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listCustomers({
        search: q,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setCustomers(result.items);
      setPage(result.page);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to load customers',
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
    setRole(getCurrentRole());
    void refresh(page, search);
  }, [router, refresh, page, search]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetForm = () => {
    setEditId(null);
    setName('');
    setEmail('');
    setPhone('');
    setCity('Addis Ababa');
    setCustomerType('COMMERCIAL');
    setFormError(null);
    setSimilar([]);
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (customer: Customer) => {
    setEditId(customer.id);
    setName(customer.name);
    setEmail(customer.email ?? '');
    setPhone(customer.phone ?? '');
    setCity(customer.city ?? '');
    setCustomerType(customer.customerType);
    setFormError(null);
    setSimilar([]);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
    setSimilar([]);
  };

  /**
   * Advisory look-alike lookup on blur. Never blocks the form — a failed
   * check just clears the warning. Create only: editing an existing
   * customer against itself isn't a duplicate.
   */
  const checkSimilar = async () => {
    if (editId || name.trim().length < 2) {
      setSimilar([]);
      return;
    }
    try {
      setSimilar(
        await checkCustomerDuplicate({ name, phone: phone || undefined }),
      );
    } catch {
      setSimilar([]);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name,
        email: email || undefined,
        phone: phone || undefined,
        city: city || undefined,
        customerType,
      };
      if (editId) {
        await updateCustomer(editId, payload);
      } else {
        await createCustomer(payload);
      }
      closeDrawer();
      setPage(1);
      setSearch('');
      setSearchInput('');
      await refresh(1, '');
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? err.message
          : `Failed to ${editId ? 'save' : 'create'} customer`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (id: string) => {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomer(id);
      setDeleteConfirmId(null);
      await refresh(page, search);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to delete customer',
      );
      setDeleteConfirmId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Customers</h1>
              <p className="text-sm text-slate-500">
                CRM accounts for elevator projects (amounts in ETB)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Link href="/projects" className={btnGhost}>
                Project pipeline
              </Link>
              <button type="button" onClick={openCreate} className={btnPrimary}>
                Create customer
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
            <form
              onSubmit={onSearch}
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[220px] flex-1">
                <label className={labelClass} htmlFor="search">
                  Search
                </label>
                <input
                  id="search"
                  className={fieldClass}
                  placeholder="Name, email, or phone"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className={btnSecondary}
              >
                Search
              </button>
            </form>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : customers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No customers yet.</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Create your first customer
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Name</th>
                        <th className="py-2 pr-4 font-semibold">Type</th>
                        <th className="py-2 pr-4 font-semibold">City</th>
                        <th className="py-2 pr-4 font-semibold">Contact</th>
                        <th className="py-2 font-semibold">Balance (ETB)</th>
                        {canWrite ? (
                          <th className="py-2 pl-4 font-semibold">Actions</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr
                          key={c.id}
                          className="border-b border-slate-100 last:border-0"
                        >
                          <td className="py-3 pr-4 font-medium text-slate-900">
                            {c.name}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {c.customerType}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {c.city ?? '—'}
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            {c.email ?? c.phone ?? '—'}
                          </td>
                          <td className="py-3 text-slate-600">
                            {c.outstandingBalanceEtb}
                          </td>
                          {canWrite ? (
                            <td className="py-3 pl-4">
                              {deleteConfirmId === c.id ? (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs text-slate-600">
                                    Delete {c.name}? This cannot be undone.
                                  </span>
                                  <button
                                    type="button"
                                    disabled={deleting}
                                    onClick={() => void onDelete(c.id)}
                                    className={`${btnDanger} px-2.5 py-1 text-xs`}
                                  >
                                    {deleting ? 'Deleting…' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={deleting}
                                    onClick={() => setDeleteConfirmId(null)}
                                    className={`${btnGhost} px-2.5 py-1 text-xs`}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(c)}
                                    className="text-sm font-semibold text-navy-800 hover:underline"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(c.id)}
                                    className="text-sm font-semibold text-red-600 hover:underline"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          ) : null}
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
        title={editId ? 'Edit customer' : 'Create customer'}
        description={
          editId
            ? undefined
            : 'Look-alike customers are flagged as a warning.'
        }
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeDrawer}
              className={`${btnSecondary} flex-1`}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="customer-form"
              disabled={submitting}
              className={`${btnPrimary} flex-1`}
            >
              {submitting
                ? 'Saving…'
                : editId
                  ? 'Save changes'
                  : similar.length > 0
                    ? 'Create anyway'
                    : 'Save customer'}
            </button>
          </div>
        }
      >
        <form
          id="customer-form"
          onSubmit={(e) => void onSubmit(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          {similar.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Already in the system
              </p>
              <ul className="mt-2 space-y-1.5">
                {similar.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 text-sm text-amber-900"
                  >
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="shrink-0 text-xs text-amber-700">
                      {[m.phone, m.city].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-800">
                You can still save — this is only a heads-up.
              </p>
            </div>
          ) : null}

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
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
              onBlur={() => void checkSimilar()}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="phone">
              Phone
            </label>
            <input
              id="phone"
              className={fieldClass}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setFormError(null);
              }}
              onBlur={() => void checkSimilar()}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="city">
              City
            </label>
            <input
              id="city"
              className={fieldClass}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="type">
              Type
            </label>
            <select
              id="type"
              className={fieldClass}
              value={customerType}
              onChange={(e) =>
                setCustomerType(e.target.value as CustomerType)
              }
            >
              <option value="COMMERCIAL">Commercial</option>
              <option value="RESIDENTIAL">Residential</option>
              <option value="GOVERNMENT">Government</option>
            </select>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
