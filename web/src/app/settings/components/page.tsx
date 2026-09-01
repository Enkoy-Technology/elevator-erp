'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, ChevronDown, ChevronUp, Pencil, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import { ListToolbar, RowAction } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  deleteComponentSpecification,
  getAccessToken,
  getCurrentRole,
  listComponentSpecifications,
  reorderComponentSpecifications,
  type ComponentSpecification,
  type UserRole,
} from '@/lib/api';

import { canEditDocumentContent, movedOrder } from '../document-content';

export default function ComponentSpecificationsPage() {
  const router = useRouter();
  const [rowsAll, setRowsAll] = useState<ComponentSpecification[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** The row whose Delete is armed. Confirm swaps the icons in place. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const canEdit = canEditDocumentContent(role);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Whole list in one envelope (about 20 rows) — the pager below slices
      // client-side. Column sorting stays off: the order is the print order.
      const result = await listComponentSpecifications();
      setRowsAll(result.items);
      setConfirmingId(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the component list',
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
    void refresh();
  }, [router, refresh]);

  const onMove = async (spec: ComponentSpecification, delta: 1 | -1) => {
    const moved = movedOrder(
      rowsAll.map((row) => row.id),
      spec.id,
      delta,
    );
    if (!moved) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await reorderComponentSpecifications(moved.ids);
      setRowsAll(result.items);
      // Follow the row across a page boundary rather than letting it vanish.
      setPage(Math.floor(moved.index / pageSize) + 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not change the print order',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (spec: ComponentSpecification) => {
    setBusy(true);
    setError(null);
    try {
      await deleteComponentSpecification(spec.id);
      setConfirmingId(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not remove ${spec.componentName}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(rowsAll.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = rowsAll.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns: ColumnDef<ComponentSpecification, unknown>[] = [
    {
      id: 'sequence',
      header: 'No.',
      meta: { align: 'right' },
      cell: ({ row }) => row.original.sequence,
    },
    {
      accessorKey: 'componentName',
      header: 'Component',
      cell: ({ row }) => (
        <span className="font-medium text-slate-900">
          {row.original.componentName}
        </span>
      ),
    },
    {
      id: 'brand',
      header: 'Brand',
      cell: ({ row }) => row.original.brand ?? '—',
    },
    {
      id: 'remark',
      header: 'Remark',
      cell: ({ row }) => (
        <span className="text-slate-600">{row.original.remark ?? '—'}</span>
      ),
    },
    ...(canEdit
      ? ([
          {
            id: 'actions',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => {
              const spec = row.original;
              const index = rowsAll.indexOf(spec);
              return (
                <div className="flex items-center justify-end gap-0.5">
                  {confirmingId === spec.id ? (
                    <>
                      <RowAction
                        icon={Check}
                        tone="danger"
                        disabled={busy}
                        label={`Confirm removing ${spec.componentName}`}
                        onClick={() => void onDelete(spec)}
                      />
                      <RowAction
                        icon={X}
                        disabled={busy}
                        label={`Keep ${spec.componentName}`}
                        onClick={() => setConfirmingId(null)}
                      />
                    </>
                  ) : (
                    <>
                      <RowAction
                        icon={ChevronUp}
                        disabled={busy || index === 0}
                        label={`Print ${spec.componentName} earlier`}
                        onClick={() => void onMove(spec, -1)}
                      />
                      <RowAction
                        icon={ChevronDown}
                        disabled={busy || index === rowsAll.length - 1}
                        label={`Print ${spec.componentName} later`}
                        onClick={() => void onMove(spec, 1)}
                      />
                      <RowAction
                        icon={Pencil}
                        label={`Edit ${spec.componentName}`}
                        onClick={() =>
                          router.push(`/settings/components/${spec.id}/edit`)
                        }
                      />
                      <RowAction
                        icon={Trash2}
                        tone="danger"
                        disabled={busy}
                        label={`Remove ${spec.componentName}`}
                        onClick={() => setConfirmingId(spec.id)}
                      />
                    </>
                  )}
                </div>
              );
            },
          },
        ] satisfies ColumnDef<ComponentSpecification, unknown>[])
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Settings"
          title="Components & brands"
          description="The component/brand table that prints as an appendix on every quotation and proforma — traction machine, encoder, inverter, door machine and the rest. Like the boilerplate text, it used to be pasted per quote, so brands and remarks drifted between documents. One list here, one appendix everywhere."
          actions={
            <Link href="/settings/boilerplate" className={btnGhost}>
              Document boilerplate
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
            actions={
              canEdit ? (
                <Link href="/settings/components/new" className={btnPrimary}>
                  Add component
                </Link>
              ) : null
            }
          />

          <DataTable
            caption="Component and brand appendix, in print order"
            columns={columns}
            rows={rows}
            getRowId={(spec) => spec.id}
            loading={loading}
            pagination={{
              page: currentPage,
              pageSize,
              total: rowsAll.length,
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
                  No components yet — documents will print without the brand
                  appendix. The twenty standard rows ship with the database
                  seed; add them here if this tenant was set up without it.
                </p>
                {canEdit ? (
                  <Link href="/settings/components/new" className={btnSecondary}>
                    Add component
                  </Link>
                ) : null}
              </div>
            }
          />

          <p className="mt-3 max-w-2xl text-xs text-slate-500">
            Removing a row is permanent. Documents already issued keep their own
            snapshot of this table, so past quotations are not rewritten.
          </p>
        </main>
      </div>
    </div>
  );
}
