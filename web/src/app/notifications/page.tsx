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
  createNotification,
  getAccessToken,
  listEmployees,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_TYPES,
  type AppNotification,
  type Employee,
  type NotificationType,
  optional,
} from '@/lib/api';

const PAGE_SIZE = 20;

const TYPE_LABEL: Record<NotificationType, string> = {
  GENERAL: 'General',
  QUOTE: 'Quote',
  ASSIGNMENT: 'Assignment',
  MAINTENANCE: 'Maintenance',
};

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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [type, setType] = useState<NotificationType>('ASSIGNMENT');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkPath, setLinkPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const refresh = useCallback(
    async (nextPage: number, onlyUnread: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const [notifPage, employeePage] = await Promise.all([
          listNotifications({
            unreadOnly: onlyUnread,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
          optional(listEmployees({ page: 1, pageSize: 100 })),
        ]);
        setItems(notifPage.items);
        setPage(notifPage.page);
        setTotal(notifPage.total);
        setTotalPages(notifPage.totalPages);
        setEmployees(employeePage.items);
        setUserId((prev) => prev || employeePage.items[0]?.id || '');
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
    void refresh(page, unreadOnly);
  }, [router, refresh, page, unreadOnly]);

  const openDrawer = () => {
    setType('ASSIGNMENT');
    setTitle('');
    setBody('');
    setLinkPath('');
    setFormError(null);
    setUserId(employees[0]?.id || '');
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setFormError(null);
  };

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId) {
      setFormError('Add an employee first, then send a notice.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createNotification({
        userId,
        type,
        title,
        body: body || undefined,
        linkPath: linkPath || undefined,
      });
      closeDrawer();
      setPage(1);
      await refresh(1, unreadOnly);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : 'Failed to send notice',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const onMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id);
      await refresh(page, unreadOnly);
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
      await refresh(page, unreadOnly);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Failed to mark all as read',
      );
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">
                Notifications
              </h1>
              <p className="text-sm text-slate-500">
                In-app alerts and assignments
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void onMarkAll()}
                disabled={markingAll}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-navy-600 hover:text-navy-800 disabled:opacity-60"
              >
                {markingAll ? 'Marking…' : 'Mark all read'}
              </button>
              <button
                type="button"
                onClick={openDrawer}
                className="rounded-lg bg-navy-800 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-navy-700"
              >
                Send notice
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
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => {
                    setPage(1);
                    setUnreadOnly(e.target.checked);
                  }}
                />
                Unread only
              </label>
              <span className="text-sm text-slate-500">{total} total</span>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">
                  {unreadOnly
                    ? 'No unread notifications.'
                    : 'No notifications yet.'}
                </p>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="mt-3 text-sm font-semibold text-navy-800 hover:underline"
                >
                  Send a notice to a colleague
                </button>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const unread = !item.readAt;
                    return (
                      <li
                        key={item.id}
                        className={`flex flex-wrap items-start justify-between gap-3 py-4 ${
                          unread ? 'bg-navy-50/40' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1 px-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                              {TYPE_LABEL[item.type]}
                            </span>
                            {unread ? (
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-navy-800">
                                New
                              </span>
                            ) : null}
                            <span className="text-xs text-slate-400">
                              {formatWhen(item.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 font-medium text-slate-900">
                            {item.title}
                          </p>
                          {item.body ? (
                            <p className="mt-1 text-sm text-slate-600">
                              {item.body}
                            </p>
                          ) : null}
                          {item.linkPath ? (
                            <Link
                              href={item.linkPath}
                              className="mt-2 inline-block text-sm font-semibold text-navy-800 hover:underline"
                            >
                              Open related page
                            </Link>
                          ) : null}
                        </div>
                        {unread ? (
                          <button
                            type="button"
                            onClick={() => void onMarkRead(item.id)}
                            className="shrink-0 text-sm font-semibold text-navy-800 hover:underline"
                          >
                            Mark read
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
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
        title="Send notice"
        description="Ping a colleague — they will see it in their inbox."
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
              form="notify-form"
              disabled={submitting}
              className="flex-1 rounded-lg bg-navy-800 py-2.5 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
            >
              {submitting ? 'Sending…' : 'Send'}
            </button>
          </div>
        }
      >
        <form
          id="notify-form"
          onSubmit={(e) => void onSend(e)}
          className="space-y-4"
        >
          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="userId">
              Recipient
            </label>
            <select
              id="userId"
              className={fieldClass}
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            >
              {employees.length === 0 ? (
                <option value="">No employees yet</option>
              ) : (
                employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName} ({employee.role})
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="type">
              Type
            </label>
            <select
              id="type"
              className={fieldClass}
              value={type}
              onChange={(e) => setType(e.target.value as NotificationType)}
            >
              {NOTIFICATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="title">
              Title
            </label>
            <input
              id="title"
              className={fieldClass}
              required
              minLength={2}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="body">
              Message
            </label>
            <textarea
              id="body"
              className={fieldClass}
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="linkPath">
              Link (optional)
            </label>
            <input
              id="linkPath"
              className={fieldClass}
              placeholder="/projects"
              value={linkPath}
              onChange={(e) => setLinkPath(e.target.value)}
            />
          </div>
        </form>
      </SideDrawer>
    </div>
  );
}
