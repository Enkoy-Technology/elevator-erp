'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { btnSecondary } from '@/components/form-styles';
import { Sidebar } from '@/components/sidebar';
import { ApiError, apiFetch, getAccessToken, type Customer } from '@/lib/api';

import { CustomerForm } from '../../customer-form';

/** Load failure and "not found" both land here — never a blank form. */
const LoadMessage = ({ message }: { message: string }) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <div className="min-w-0 flex-1 p-6 sm:p-8">
      <p className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">
        {message}
      </p>
      <Link href="/customers" className={`${btnSecondary} mt-4`}>
        Back to customers
      </Link>
    </div>
  </div>
);

export default function EditCustomerPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        // GET /customers/:id exists on CustomersController — fetch the one
        // record rather than paging the whole list to find it.
        const record = await apiFetch<Customer>(`/customers/${id}`);
        if (!cancelled) {
          setCustomer(record);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Failed to load this customer',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [router, id]);

  if (loading) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <p className="min-w-0 flex-1 p-6 text-sm text-slate-500 sm:p-8">Loading…</p>
      </div>
    );
  }
  if (error) {
    return <LoadMessage message={error} />;
  }
  if (!customer) {
    return <LoadMessage message="That customer no longer exists." />;
  }
  return <CustomerForm customer={customer} />;
}
