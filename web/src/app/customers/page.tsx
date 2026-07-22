'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  createCustomer,
  getAccessToken,
  listCustomers,
  type Customer,
  type CustomerType,
} from '@/lib/api';

const field =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm ' +
  'outline-none transition focus:border-navy-600 focus:ring-2 focus:ring-navy-600/20';

const label =
  'mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500';

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [customerType, setCustomerType] =
    useState<CustomerType>('COMMERCIAL');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      setCustomers(await listCustomers(q));
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
    void refresh();
  }, [router, refresh]);

  const onSearch = async (event: FormEvent) => {
    event.preventDefault();
    await refresh(search);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createCustomer({
        name,
        email: email || undefined,
        phone: phone || undefined,
        city: city || undefined,
        customerType,
      });
      setName('');
      setEmail('');
      setPhone('');
      await refresh(search);
    } catch (err) {
      setError(
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
            <div className="flex gap-2 text-sm">
              <span className="rounded-lg bg-navy-800 px-3 py-1.5 font-medium text-white">
                Customers
              </span>
              <Link
                href="/projects"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 transition hover:border-navy-600 hover:text-navy-800"
              >
                Project pipeline
              </Link>
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
              New customer
            </h2>
            <form
              onSubmit={onCreate}
              className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <div>
                <label className={label} htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  className={field}
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className={field}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="phone">
                  Phone
                </label>
                <input
                  id="phone"
                  className={field}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="city">
                  City
                </label>
                <input
                  id="city"
                  className={field}
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <div>
                <label className={label} htmlFor="type">
                  Type
                </label>
                <select
                  id="type"
                  className={field}
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
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
                >
                  {submitting ? 'Saving…' : 'Create customer'}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <form
              onSubmit={onSearch}
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[220px] flex-1">
                <label className={label} htmlFor="search">
                  Search
                </label>
                <input
                  id="search"
                  className={field}
                  placeholder="Name, email, or phone"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
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
              <p className="text-sm text-slate-500">No customers yet.</p>
            ) : (
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
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
