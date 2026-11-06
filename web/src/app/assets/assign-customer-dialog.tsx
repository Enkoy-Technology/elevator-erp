'use client';

import { useEffect, useState } from 'react';

import { Dialog } from '@/components/dialog';
import { btnSecondary, fieldClass } from '@/components/form-styles';
import { listCustomers, type Customer } from '@/lib/api';

const rowClass =
  'block w-full px-3 py-3 text-left text-sm font-medium text-slate-900 hover:bg-slate-100 active:bg-slate-200';

/**
 * Who a lift is sold to. Searched, because a company has more customers than
 * fit in a dropdown.
 */
export const AssignCustomerDialog = ({
  liftName,
  hasCustomer,
  onPick,
  onClose,
}: {
  liftName: string;
  hasCustomer: boolean;
  /** Null puts the lift back in stock. */
  onPick: (customerId: string | null) => void;
  onClose: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    const load = async () => {
      try {
        const { items } = await listCustomers({
          search,
          page: 1,
          pageSize: 20,
        });
        if (!stale) {
          setCustomers(items);
          setFailed(false);
        }
      } catch {
        if (!stale) {
          setFailed(true);
        }
      }
    };
    const timer = setTimeout(() => void load(), search ? 250 : 0);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <Dialog
      open
      title="Assign customer"
      description={`Who is ${liftName} sold to?`}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
      }
    >
      <input
        aria-label="Search customers"
        autoFocus
        className={fieldClass}
        placeholder="Search by name or phone"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="mt-3 max-h-72 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
        {failed ? (
          <p role="alert" className="px-3 py-3 text-sm text-red-700">
            Customers could not be loaded. Check the connection and try again.
          </p>
        ) : customers === null ? (
          <p className="px-3 py-3 text-sm text-slate-500">Loading customers…</p>
        ) : customers.length === 0 ? (
          <p className="px-3 py-3 text-sm text-slate-500">
            No customer matches. Register the customer first, under Customers.
          </p>
        ) : (
          customers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onPick(customer.id)}
              className={rowClass}
            >
              {customer.name}
            </button>
          ))
        )}
        {hasCustomer ? (
          <button
            type="button"
            onClick={() => onPick(null)}
            className={`${rowClass} text-slate-600`}
          >
            Back in stock, no customer
          </button>
        ) : null}
      </div>
    </Dialog>
  );
};
