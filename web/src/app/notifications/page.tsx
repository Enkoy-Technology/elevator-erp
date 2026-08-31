'use client';

import type { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { MailOpen } from 'lucide-react';

import { btnPrimary, btnSecondary } from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import {
  FilterSelect,
  ListToolbar,
  RowAction,
  StatusPill,
} from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  getAccessToken,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationType,
} from '@/lib/api';
import { csvRows, saveCsv } from '@/app/employees/csv';

const TYPE_LABEL: Record<NotificationType, string> = {
  GENERAL: 'General',
  QUOTE: 'Quote',
  ASSIGNMENT: 'Assignment',
  MAINTENANCE: 'Maintenance',
};

/** Bulk-bar button: matches the bar's own Clear control, not a page button. */
const bulkBtn =
  'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium ' +
  'text-slate-700 transition hover:border-slate-400 hover:bg-slate-50';

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
};

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);

  const refresh = useCallback(
    async (nextPage: number, onlyUnread: boolean, size: number) => {
      setLoading(true);
      setError(null);
      // The rows behind the selection are about to be replaced; a selection
      // that outlives them would act on ids the user can no longer see.
      setSelectedIds(new Set());
      try {
        const notifPage = await listNotifications({
          unreadOnly: onlyUnread,
          page: nextPage,
          pageSize: size,
        });
        setItems(notifPage.items);
        setPage(notifPage.page);
        setTotal(notifPage.total);
        setTotalPages(notifPage.totalPages);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Failed to load notifications',
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
    void refresh(page, unreadOnly, pageSize);
  }, [router, refresh, page, unreadOnly, pageSize]);

  const onMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await refresh(page, unreadOnly, pageSize);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to mark as read',
      );
    }
  };

  const onMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      await refresh(page, unreadOnly, pageSize);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to mark all as read',
      );
    } finally {
      setMarkingAll(false);
    }
  };

  const selected = items.filter((item) => selectedIds.has(item.id));

  const exportSelected = () => {
    saveCsv(
      'notifications-selected.csv',
      csvRows([
        ['Type', 'Title', 'Body', 'Linked record', 'Received', 'State'],
        ...selected.map((item) => [
          TYPE_LABEL[item.type],
          item.title,
          item.body ?? '',
          item.linkPath ?? '',
          item.createdAt,
          item.readAt ? 'Read' : 'New',
        ]),
      ]),
    );
  };

  const markSelectedRead = async () => {
    const targets = selected.filter((item) => !item.readAt);
    if (targets.length === 0) {
      setBulkNotice('Every selected notification has already been read.');
      return;
    }
    setBulkNotice(null);
    // No bulk endpoint for a subset — read-all is all-or-nothing — so this is
    // N PATCHes and a partial failure is reported as one.
    const results = await Promise.allSettled(
      targets.map((item) => markNotificationRead(item.id)),
    );
    const failed = results.filter((result) => result.status === 'rejected').length;
    setBulkNotice(
      failed === 0
        ? `Marked ${targets.length} notification(s) read.`
        : `Marked ${targets.length - failed} of ${targets.length} read. ${failed} failed and are still unread — try those again.`,
    );
    await refresh(page, unreadOnly, pageSize);
  };

  const columns: ColumnDef<AppNotification, unknown>[] = [
    {
      id: 'type',
      header: 'Type',
      cell: ({ row }) => <StatusPill label={TYPE_LABEL[row.original.type]} />,
    },
    {
      id: 'notice',
      header: 'Notice',
      cell: ({ row }) => (
        <div className="min-w-[16rem] max-w-xl">
          <p className={row.original.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}>
            {row.original.title}
          </p>
          {row.original.body ? (
            <p className="mt-0.5 text-xs text-slate-500">{row.original.body}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'linkPath',
      header: 'Linked record',
      cell: ({ row }) =>
        row.original.linkPath ? (
          <Link
            href={row.original.linkPath}
            className="font-semibold text-navy-800 hover:underline"
          >
            {row.original.linkPath}
          </Link>
        ) : (
          '\u2014'
        ),
    },
    {
      id: 'createdAt',
      header: 'Received',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{formatWhen(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'readState',
      header: 'State',
      cell: ({ row }) =>
        row.original.readAt ? (
          <StatusPill label="Read" />
        ) : (
          <StatusPill label="New" tone="active" />
        ),
    },
    {
      id: 'actions',
      header: '',
      meta: { align: 'right' },
      // A notification has neither a delete nor a dismiss endpoint — marking
      // it read is the only thing the API lets this column do.
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          {row.original.readAt ? null : (
            <RowAction
              icon={MailOpen}
              label={`Mark “${row.original.title}” read`}
              onClick={() => void onMarkRead(row.original.id)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Overview"
          title="Notifications"
          description="In-app alerts and work assigned to you. Anything with a link opens the record it came from."
          actions={
            <>
              <button
                type="button"
                onClick={() => void onMarkAll()}
                disabled={markingAll}
                className={btnSecondary}
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
              <Link href="/notifications/new" className={btnPrimary}>
                Send notice
              </Link>
            </>
          }
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <ListToolbar
            filters={
              <FilterSelect
                label="Read state"
                value={unreadOnly ? 'UNREAD' : ''}
                onChange={(value) => {
                  setPage(1);
                  setUnreadOnly(value === 'UNREAD');
                }}
                options={[{ value: 'UNREAD', label: 'Unread only' }]}
                allLabel="All notifications"
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
            rows={items}
            getRowId={(item) => item.id}
            loading={loading}
            caption="Notifications"
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            getRowLabel={(item) => item.title}
            bulkActions={
              <>
                <button type="button" onClick={exportSelected} className={bulkBtn}>
                  Export selected
                </button>
                <button
                  type="button"
                  onClick={() => void markSelectedRead()}
                  className={bulkBtn}
                >
                  Mark selected read
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
              unreadOnly
                ? 'Nothing unread. Switch Read state to All notifications to see the earlier alerts.'
                : 'No notifications yet. Send one to a colleague here \u2014 assignments raised elsewhere in the system also land on this screen.'
            }
          />
        </main>
      </div>
    </div>
  );
}
