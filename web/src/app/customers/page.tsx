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
  createCustomer,
  getAccessToken,
  listCustomers,
  type Customer,
  type CustomerType,
} from '@/lib/api';

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
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
    void refresh(page, search);
  }, [router, refresh, page, search]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setCity('Addis Ababa');
    setCustomerType('COMMERCIAL');
    setFormError(null);
  };

  const openDrawer = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await createCustomer({
        name,
        email: email || undefined,
        phone: phone || undefined,
        city: city || undefined,
        customerType,
      });
      closeDrawer();
      setPage(1);
      setSearch('');
      setSearchInput('');
      await refresh(1, '');
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to create customer',
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
              <h1 className="font-display text-lg font-semibold">Customers</h1>
              <p className="text-sm text-slate-500">
                CRM accounts for elevator projects (amounts in ETB)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-lg bg-navy-800 px-3 py-1.5 font-medium text-white">
                Customers
              </span>
              <Link
                href="/projects"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-navy-600 hover:text-navy-800"
              >
                Project pipeline
              </Link>
              <button
                type="button"
                onClick={openDrawer}
                className="rounded-lg bg-navy-800 px-3 py-1.5 font-semibold text-white transition hover:bg-navy-700"
              >
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
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-navy-600 hover:text-navy-800"
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
                  onClick={openDrawer}
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
        title="Create customer"
        description="Add a CRM account for elevator projects."
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
              form="create-customer-form"
              disabled={submitting}
              className="flex-1 rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : 'Save customer'}
            </button>
          </div>
        }
      >
        <form
          id="create-customer-form"
          onSubmit={onCreate}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
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
              onChange={(e) => setName(e.target.value)}
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
              onChange={(e) => setPhone(e.target.value)}
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
