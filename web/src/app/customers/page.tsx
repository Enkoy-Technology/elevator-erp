'use client';

import Link from 'next/link';
import { updatedColumn } from '@/components/updated-column';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ColumnDef } from '@tanstack/react-table';

import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { ListToolbar, RowAction, SearchField } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { csvRows, saveCsv } from '@/app/employees/csv';
import {
  ApiError,
  deleteCustomer,
  getAccessToken,
  getCurrentRole,
  listCustomers,
  type Customer,
  type UserRole,
} from '@/lib/api';
import { formatEtb } from '@/lib/money';
import { Check, Pencil, Trash2, X } from 'lucide-react';

/** Mirrors @Roles('SALES_MANAGER') on the customers PATCH/DELETE routes;
 *  CEO and ADMIN bypass via RolesGuard's SUPER_ROLES. */
const canWriteCustomers = (role: UserRole | null): boolean =>
  role === 'SALES_MANAGER' || role === 'CEO' || role === 'ADMIN';

const CSV_HEADERS = [
  'Name',
  'Type',
  'City',
  'Email',
  'Phone',
  'Net balance (ETB)',
] as const;

export default function CustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /** The row whose Delete is armed. Confirm swaps the icons in place. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = canWriteCustomers(role);

  const refresh = useCallback(
    async (nextPage: number, q: string, size: number) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listCustomers({
          search: q,
          page: nextPage,
          pageSize: size,
        });
        setCustomers(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        // The rows just changed underneath the selection; a checkbox set
        // pointing at rows nobody can see is how a bulk action hits the
        // wrong records.
        setSelected(new Set());
        setConfirmingId(null);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load customers',
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
    setRole(getCurrentRole());
    void refresh(page, search, pageSize);
  }, [router, refresh, page, search, pageSize]);

  const runSearch = (term: string) => {
    setPage(1);
    setSearch(term.trim());
  };

  const onDelete = async (customer: Customer) => {
    setBusy(true);
    setError(null);
    try {
      await deleteCustomer(customer.id);
      setConfirmingId(null);
      await refresh(page, search, pageSize);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Could not delete ${customer.name}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const onBulkDelete = async () => {
    const ids = [...selected];
    if (
      !window.confirm(
        `Delete ${ids.length} customer${ids.length === 1 ? '' : 's'}? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    // No bulk endpoint exists, so this is N calls. Report the real tally
    // rather than pretending the loop was one atomic delete.
    const results = await Promise.allSettled(ids.map((id) => deleteCustomer(id)));
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBusy(false);
    await refresh(page, search, pageSize);
    if (failed > 0) {
      setError(
        `Deleted ${ids.length - failed} of ${ids.length}. ${failed} could not be deleted — they may still have projects or invoices.`,
      );
    }
  };

  const onExportSelected = () => {
    const rows = customers.filter((c) => selected.has(c.id));
    saveCsv(
      'customers.csv',
      csvRows([
        CSV_HEADERS,
        ...rows.map((c) => [
          c.name,
          c.customerType,
          c.city ?? '',
          c.email ?? '',
          c.phone ?? '',
          c.outstandingBalanceEtb ?? '',
        ]),
      ]),
    );
  };

  const columns: ColumnDef<Customer, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">{row.original.name}</span>
      ),
    },
    { accessorKey: 'customerType', header: 'Type' },
    { id: 'city', header: 'City', cell: ({ row }) => row.original.city ?? '—' },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => row.original.email ?? row.original.phone ?? '—',
    },
    {
      id: 'balance',
      header: 'Net balance',
      meta: { align: 'right' },
      cell: ({ row }) => formatEtb(row.original.outstandingBalanceEtb),
    },
    updatedColumn<Customer>((row) => row.updatedAt),
    ...(canWrite
      ? ([
          {
            id: 'actions',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => {
              const customer = row.original;
              return (
                <div className="flex items-center justify-end gap-0.5">
                  {confirmingId === customer.id ? (
                    <>
                      <RowAction
                        icon={Check}
                        tone="danger"
                        disabled={busy}
                        label={`Confirm deleting ${customer.name}`}
                        onClick={() => void onDelete(customer)}
                      />
                      <RowAction
                        icon={X}
                        disabled={busy}
                        label={`Keep ${customer.name}`}
                        onClick={() => setConfirmingId(null)}
                      />
                    </>
                  ) : (
                    <>
                      <RowAction
                        icon={Pencil}
                        label={`Edit ${customer.name}`}
                        onClick={() =>
                          router.push(`/customers/${customer.id}/edit`)
                        }
                      />
                      <RowAction
                        icon={Trash2}
                        tone="danger"
                        label={`Delete ${customer.name}`}
                        onClick={() => setConfirmingId(customer.id)}
                      />
                    </>
                  )}
                </div>
              );
            },
          },
        ] satisfies ColumnDef<Customer, unknown>[])
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Sales"
          title="Customers"
          description="CRM accounts for elevator projects. Balances are in ETB."
          actions={
            <Link href="/projects" className={btnGhost}>
              Project pipeline
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
            search={
              <SearchField
                value={searchInput}
                onChange={setSearchInput}
                onSubmit={runSearch}
                placeholder="Name, email, or phone"
              />
            }
            actions={
              <Link href="/customers/new" className={btnPrimary}>
                Create customer
              </Link>
            }
          />

          <DataTable
            caption="Customers"
            columns={columns}
            rows={customers}
            getRowId={(c) => c.id}
            getRowLabel={(c) => c.name}
            // Opens the customer. The Edit/Delete buttons in the last column
            // keep working — DataTable's row click stands down for anything
            // interactive inside the row.
            getRowHref={(c) => `/customers/${c.id}`}
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
              <div className="space-y-3">
                <p>
                  {search
                    ? `No customer matches “${search}”. Clear the search to see the full list.`
                    : 'No customers yet. Create one here, then open a project against it on Projects.'}
                </p>
                {canWrite ? (
                  <Link href="/customers/new" className={btnSecondary}>
                    Create customer
                  </Link>
                ) : null}
              </div>
            }
          />
        </main>
      </div>
    </div>
  );
}
