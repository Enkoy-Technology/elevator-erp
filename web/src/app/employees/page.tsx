'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { ListToolbar, RowAction, SearchField, StatusPill } from '@/components/list-toolbar';
import { Ban, Check, Pencil, X } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  listEmployees,
  updateEmployee,
  type Employee,
} from '@/lib/api';
import { csvRows, saveCsv } from './csv';
import { ROLE_LABELS } from './labels';

/** Bulk-bar button: matches the bar's own Clear control, not a page button. */
const bulkBtn =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium ' +
  'text-slate-700 transition hover:border-slate-400 hover:bg-slate-50';

export default function EmployeesPage() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  // Which row is mid-confirm. One at a time: opening a second confirm closes
  // the first, so there is never an ambiguous armed button off-screen.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, size: number, q: string) => {
      setLoading(true);
      setError(null);
      // The rows behind the selection are about to be replaced; a selection
      // that outlives them would act on ids the user can no longer see.
      setSelectedIds(new Set());
      setConfirmId(null);
      try {
        const result = await listEmployees({
          q,
          page: nextPage,
          pageSize: size,
        });
        setEmployees(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : 'Failed to load employees',
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
    void refresh(page, pageSize, search);
  }, [router, refresh, page, pageSize, search]);

  const runSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const selected = employees.filter((employee) => selectedIds.has(employee.id));

  const exportSelected = () => {
    saveCsv(
      'employees-selected.csv',
      csvRows([
        ['Full name', 'Email', 'Role', 'Phone', 'Active'],
        ...selected.map((employee) => [
          employee.fullName,
          employee.email,
          employee.role,
          employee.phone ?? '',
          employee.isActive ? 'Yes' : 'No',
        ]),
      ]),
    );
  };

  const deactivateOne = async (employee: Employee) => {
    setConfirmId(null);
    try {
      await updateEmployee(employee.id, { isActive: false });
      await refresh(page, pageSize, search);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to deactivate employee',
      );
    }
  };

  const deactivateSelected = async () => {
    const targets = selected.filter((employee) => employee.isActive);
    if (targets.length === 0) {
      setBulkNotice('Every selected employee is already inactive.');
      return;
    }
    if (
      !window.confirm(
        `Deactivate ${targets.length} employee(s)? They will not be able to log in.`,
      )
    ) {
      return;
    }
    setBulkNotice(null);
    // No bulk endpoint exists — this is N PATCHes, so it is NOT atomic and a
    // partial failure is reported as one rather than dressed up as success.
    const results = await Promise.allSettled(
      targets.map((employee) => updateEmployee(employee.id, { isActive: false })),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    setBulkNotice(
      failed === 0
        ? `Deactivated ${targets.length} employee(s).`
        : `Deactivated ${targets.length - failed} of ${targets.length}. ${failed} failed and are still active — try those again.`,
    );
    await refresh(page, pageSize, search);
  };

  const columns: ColumnDef<Employee, unknown>[] = [
    {
      accessorKey: 'fullName',
      header: 'Name',
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">{row.original.fullName}</span>
      ),
    },
    { accessorKey: 'email', header: 'Email' },
    {
      id: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <StatusPill label={ROLE_LABELS[row.original.role] ?? row.original.role} />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill
          label={row.original.isActive ? 'Active' : 'Inactive'}
          tone={row.original.isActive ? 'good' : 'neutral'}
        />
      ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => {
        const employee = row.original;
        return (
          <div className="flex items-center justify-end gap-0.5">
            <RowAction
              icon={Pencil}
              label={`Edit ${employee.fullName}`}
              onClick={() => router.push(`/employees/${employee.id}/edit`)}
            />
            {/* There is no DELETE for an employee — the record is referenced
                by every job they touched. Deactivating is the destructive
                action that actually exists, so that is what sits here. */}
            {employee.isActive ? (
              confirmId === employee.id ? (
                <>
                  <RowAction
                    icon={Check}
                    tone="danger"
                    label={`Confirm deactivating ${employee.fullName}`}
                    onClick={() => void deactivateOne(employee)}
                  />
                  <RowAction
                    icon={X}
                    label={`Keep ${employee.fullName} active`}
                    onClick={() => setConfirmId(null)}
                  />
                </>
              ) : (
                <RowAction
                  icon={Ban}
                  tone="danger"
                  label={`Deactivate ${employee.fullName}`}
                  onClick={() => setConfirmId(employee.id)}
                />
              )
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="People"
          title="Employees"
          description="The staff directory. A person's role here is what the API grants them across every screen."
          actions={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push('/employees/import')}
                className={btnSecondary}
              >
                Import
              </button>
              <button
                type="button"
                onClick={() => router.push('/employees/new')}
                className={btnPrimary}
              >
                Add employee
              </button>
            </div>
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
                placeholder="Name or email"
              />
            }
          />

          {bulkNotice ? (
            <p className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              {bulkNotice}
            </p>
          ) : null}

          <DataTable
            columns={columns}
            rows={employees}
            getRowId={(employee) => employee.id}
            loading={loading}
            caption="Employees"
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getRowLabel={(employee) => employee.fullName}
            bulkActions={
              <>
                {/* Sized to the selection bar's own Clear button, not the
                    page's full-size btnSecondary. */}
                <button type="button" onClick={exportSelected} className={bulkBtn}>
                  Export selected
                </button>
                <button
                  type="button"
                  onClick={() => void deactivateSelected()}
                  className={bulkBtn}
                >
                  Deactivate selected
                </button>
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
              search
                ? `No employee matches “${search}”. Clear the search to see everyone.`
                : 'No employees yet. Add one here and give them a role — that role decides what they can open.'
            }
          />
        </main>
      </div>
    </div>
  );
}
