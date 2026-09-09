'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';

import { DataTable } from '@/components/data-table';
import { btnPrimary } from '@/components/form-styles';
import { RowAction } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  deleteMessageTemplate,
  getAccessToken,
  listMessageTemplates,
  type MessageTemplate,
  type StarterTemplate,
} from '@/lib/api';

export default function MessageTemplatesPage() {
  const router = useRouter();
  const [saved, setSaved] = useState<MessageTemplate[]>([]);
  const [starters, setStarters] = useState<StarterTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listMessageTemplates();
      setSaved(result.saved);
      setStarters(result.starters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load templates');
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

  const remove = async (template: MessageTemplate) => {
    if (!window.confirm(`Delete the template "${template.name}"?`)) {
      return;
    }
    try {
      await deleteMessageTemplate(template.id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete the template');
    }
  };

  const columns: ColumnDef<MessageTemplate, unknown>[] = [
    { accessorKey: 'name', header: 'Name', enableSorting: true },
    {
      accessorKey: 'body',
      header: 'Message',
      cell: ({ row }) => <span className="text-xs text-slate-600">{row.original.body}</span>,
    },
    {
      id: 'updated',
      header: 'Updated',
      cell: ({ row }) => row.original.updatedAt.slice(0, 10),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <RowAction
            icon={Pencil}
            label={`Edit ${row.original.name}`}
            onClick={() => router.push(`/messages/templates/${row.original.id}/edit`)}
          />
          <RowAction
            icon={Trash2}
            tone="danger"
            label={`Delete ${row.original.name}`}
            onClick={() => void remove(row.original)}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Communication"
          title="Message templates"
          description="Wording the office reuses: holiday greetings, notices, standard reminders. {{name}} and {{company}} are filled in per recipient."
          actions={
            <Link href="/messages/templates/new" className={btnPrimary}>
              New template
            </Link>
          }
        />
        <main className="flex-1 space-y-6 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          ) : null}

          <DataTable
            columns={columns}
            rows={saved}
            getRowId={(t) => t.id}
            loading={loading}
            empty={
              <>
                No saved templates yet. Pick a starter below and{' '}
                <Link href="/messages/templates/new" className="font-semibold text-navy-800 hover:underline">
                  save your own wording
                </Link>
                .
              </>
            }
          />

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3.5">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Starters
              </h2>
            </div>
            <ul className="divide-y divide-slate-100">
              {starters.map((t) => (
                <li key={t.name} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-600">{t.body}</p>
                  </div>
                  <Link
                    href={`/messages/templates/new?name=${encodeURIComponent(t.name)}&body=${encodeURIComponent(t.body)}`}
                    className="text-xs font-medium text-gold-600 hover:underline"
                  >
                    Save as my template →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </main>
      </div>
    </div>
  );
}
