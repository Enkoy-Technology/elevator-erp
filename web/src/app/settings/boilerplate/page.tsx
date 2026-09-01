'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Check, ChevronDown, ChevronUp, EyeOff, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { DataTable } from '@/components/data-table';
import { btnGhost, btnPrimary, btnSecondary } from '@/components/form-styles';
import { ListToolbar, RowAction, StatusPill } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  deactivateBoilerplateSection,
  getAccessToken,
  getCurrentRole,
  listBoilerplateSections,
  reorderBoilerplateSections,
  type BoilerplateSection,
  type UserRole,
} from '@/lib/api';

import { bodyPreview, canEditDocumentContent, movedOrder } from '../document-content';

export default function BoilerplateSettingsPage() {
  const router = useRouter();
  const [sections, setSections] = useState<BoilerplateSection[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  /** The row whose Hide is armed. Confirm swaps the icons in place. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const canEdit = canEditDocumentContent(role);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The endpoint returns the COMPLETE list in one envelope — there are
      // eight of these — so the pager below slices client-side. Sorting the
      // columns is deliberately off: the order IS the print order, and a
      // column sort would make the up/down arrows lie.
      const result = await listBoilerplateSections();
      setSections(result.items);
      setConfirmingId(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to load the document boilerplate',
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

  const onMove = async (section: BoilerplateSection, delta: 1 | -1) => {
    const moved = movedOrder(
      sections.map((s) => s.id),
      section.id,
      delta,
    );
    if (!moved) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await reorderBoilerplateSections(moved.ids);
      setSections(result.items);
      // Follow the row if it just crossed a page boundary — otherwise the
      // section a person is moving vanishes mid-drag.
      setPage(Math.floor(moved.index / pageSize) + 1);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not change the print order',
      );
    } finally {
      setBusy(false);
    }
  };

  const onDeactivate = async (section: BoilerplateSection) => {
    setBusy(true);
    setError(null);
    try {
      await deactivateBoilerplateSection(section.id);
      setConfirmingId(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `Could not hide ${section.title ?? section.sectionKey}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(sections.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const rows = sections.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const columns: ColumnDef<BoilerplateSection, unknown>[] = [
    {
      id: 'order',
      header: '#',
      meta: { align: 'right' },
      cell: ({ row }) => sections.indexOf(row.original) + 1,
    },
    {
      id: 'section',
      header: 'Section',
      cell: ({ row }) => (
        <div className="min-w-0">
          <span className="font-medium text-slate-900">
            {row.original.title ?? 'Untitled'}
          </span>
          <span className="mt-0.5 block font-mono text-[11px] text-slate-400">
            {row.original.sectionKey}
          </span>
        </div>
      ),
    },
    {
      id: 'body',
      header: 'Prints as',
      cell: ({ row }) => (
        <span className="text-slate-600">{bodyPreview(row.original.body)}</span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.isActive ? (
          <StatusPill label="Printing" tone="good" />
        ) : (
          <StatusPill label="Hidden" tone="neutral" />
        ),
    },
    ...(canEdit
      ? ([
          {
            id: 'actions',
            header: '',
            meta: { align: 'right' },
            cell: ({ row }) => {
              const section = row.original;
              const name = section.title ?? section.sectionKey;
              const index = sections.indexOf(section);
              return (
                <div className="flex items-center justify-end gap-0.5">
                  {confirmingId === section.id ? (
                    <>
                      <RowAction
                        icon={Check}
                        tone="danger"
                        disabled={busy}
                        label={`Confirm hiding ${name} from printed documents`}
                        onClick={() => void onDeactivate(section)}
                      />
                      <RowAction
                        icon={X}
                        disabled={busy}
                        label={`Keep printing ${name}`}
                        onClick={() => setConfirmingId(null)}
                      />
                    </>
                  ) : (
                    <>
                      <RowAction
                        icon={ChevronUp}
                        disabled={busy || index === 0}
                        label={`Print ${name} earlier`}
                        onClick={() => void onMove(section, -1)}
                      />
                      <RowAction
                        icon={ChevronDown}
                        disabled={busy || index === sections.length - 1}
                        label={`Print ${name} later`}
                        onClick={() => void onMove(section, 1)}
                      />
                      <RowAction
                        icon={Pencil}
                        label={`Edit ${name}`}
                        onClick={() =>
                          router.push(`/settings/boilerplate/${section.id}/edit`)
                        }
                      />
                      <RowAction
                        icon={EyeOff}
                        tone="danger"
                        disabled={busy || !section.isActive}
                        label={`Stop printing ${name}`}
                        onClick={() => setConfirmingId(section.id)}
                      />
                    </>
                  )}
                </div>
              );
            },
          },
        ] satisfies ColumnDef<BoilerplateSection, unknown>[])
      : []),
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Settings"
          title="Document boilerplate"
          description="The standing text that prints on every quotation and proforma — standards, cabin finishing, machine and control system, rescue device and the rest. It used to be pasted into each document by hand, which is how the client's own proforma ended up saying “Simplex” on page 2 and “Duplex” on page 3. Edited here once, it prints the same on every document."
          actions={
            <Link href="/settings/components" className={btnGhost}>
              Components &amp; brands
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
                <Link href="/settings/boilerplate/new" className={btnPrimary}>
                  Add section
                </Link>
              ) : null
            }
          />

          <DataTable
            caption="Document boilerplate sections, in print order"
            columns={columns}
            rows={rows}
            getRowId={(section) => section.id}
            loading={loading}
            pagination={{
              page: currentPage,
              pageSize,
              total: sections.length,
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
                  No boilerplate yet — quotations will print the price and spec
                  pages only. The eight standard sections ship with the
                  database seed; add them here if this tenant was set up
                  without it.
                </p>
                {canEdit ? (
                  <Link href="/settings/boilerplate/new" className={btnSecondary}>
                    Add section
                  </Link>
                ) : null}
              </div>
            }
          />

          <p className="mt-3 max-w-2xl text-xs text-slate-500">
            Hiding a section stops it printing but keeps its text. There is no
            un-hide from this screen yet — the API has no reactivate route.
          </p>
        </main>
      </div>
    </div>
  );
}
