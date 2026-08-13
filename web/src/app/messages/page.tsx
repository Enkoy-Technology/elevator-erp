'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { btnGhost, btnPrimary, fieldClass } from '@/components/form-styles';
import { Pagination } from '@/components/pagination';
import { Sidebar } from '@/components/sidebar';
import {
  ApiError,
  downloadOutbox,
  getAccessToken,
  getCurrentRole,
  getOutboxProvider,
  getSettings,
  listOutbox,
  retryOutboxMessage,
  type MessageChannel,
  type MessageStatus,
  type OutboundMessage,
  type OutboxExportFormat,
  type TenantSettings,
  type UserRole,
} from '@/lib/api';

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<MessageStatus, string> = {
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
};

const STATUS_BADGE: Record<MessageStatus, string> = {
  QUEUED: 'bg-amber-100 text-amber-700',
  SENDING: 'bg-sky-100 text-sky-700',
  SENT: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
};

const STATUS_FILTERS: readonly MessageStatus[] = ['QUEUED', 'SENDING', 'SENT', 'FAILED'];

const CHANNEL_LABEL: Record<MessageChannel, string> = {
  SMS: 'SMS',
  EMAIL: 'Email',
};

const CHANNEL_FILTERS: readonly MessageChannel[] = ['SMS', 'EMAIL'];

/** Mirrors OutboxController's class-level @Roles('ADMIN'); CEO/ADMIN bypass
 *  via RolesGuard's SUPER_ROLES. The whole page is already nav-gated to the
 *  same roles — this only guards the Retry button's own render. */
const canRetry = (role: UserRole | null): boolean =>
  role === 'ADMIN' || role === 'CEO';

const formatWhen = (iso: string | null): string => {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

/**
 * `subjectKind`/`subjectId` (task-2's reminder crons) resolve to a link only
 * where the target page actually reads that query param — see
 * MaintenanceReminderService's own `/maintenance?contract=<id>`/
 * `/maintenance?breakdown=<id>` linkPath convention. INVOICE has no such
 * deep link today (the invoices list page filters by number, not id) —
 * "a link when resolvable" (task-3 brief §3.3) means exactly that: some
 * subjects show plain text, not a broken/generic link.
 */
const subjectLink = (kind: string | null, id: string | null): string | null => {
  if (!kind || !id) {
    return null;
  }
  if (kind === 'MAINTENANCE_CONTRACT') {
    return `/maintenance?contract=${id}`;
  }
  if (kind === 'BREAKDOWN') {
    return `/maintenance?breakdown=${id}`;
  }
  return null;
};

export default function MessagesPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole | null>(null);

  const [items, setItems] = useState<OutboundMessage[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<MessageStatus | ''>('');
  const [channelFilter, setChannelFilter] = useState<MessageChannel | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [provider, setProvider] = useState<string | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(
    async (
      nextPage: number,
      status: MessageStatus | '',
      channel: MessageChannel | '',
      from: string,
      to: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listOutbox({
          status: status || undefined,
          channel: channel || undefined,
          from: from || undefined,
          to: to || undefined,
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        setItems(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load messages');
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
    void (async () => {
      try {
        const [providerResult, settingsResult] = await Promise.all([
          getOutboxProvider(),
          getSettings(),
        ]);
        setProvider(providerResult.provider);
        setSettings(settingsResult);
      } catch {
        // Non-fatal — the list below is the page's real content; the
        // provider banner/consent summary just stay blank on a failure.
      }
    })();
  }, [router]);

  useEffect(() => {
    void refresh(page, statusFilter, channelFilter, fromDate, toDate);
  }, [refresh, page, statusFilter, channelFilter, fromDate, toDate]);

  const setStatus = (next: MessageStatus | '') => {
    setPage(1);
    setStatusFilter(next);
  };

  const setChannel = (next: MessageChannel | '') => {
    setPage(1);
    setChannelFilter(next);
  };

  const setFrom = (next: string) => {
    setPage(1);
    setFromDate(next);
  };

  const setTo = (next: string) => {
    setPage(1);
    setToDate(next);
  };

  const onRetry = async (message: OutboundMessage) => {
    setBusyId(message.id);
    setError(null);
    try {
      await retryOutboxMessage(message.id);
      await refresh(page, statusFilter, channelFilter, fromDate, toDate);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to retry message');
    } finally {
      setBusyId(null);
    }
  };

  const onDownload = async (format: OutboxExportFormat) => {
    setError(null);
    try {
      await downloadOutbox(format, {
        status: statusFilter || undefined,
        channel: channelFilter || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download failed');
    }
  };

  const isLive = provider !== null && provider !== 'noop';
  const canWrite = canRetry(role);

  const maintenanceSkipped = settings?.maintenanceReminderConsentSkippedCount ?? null;
  const paymentSkipped = settings?.paymentReminderConsentSkippedCount ?? null;
  // I4: an already-bad stored phone number is the OTHER reason a reminder
  // silently never arrives — counted and surfaced alongside the existing
  // consent-skip counters, in the same banner.
  const maintenanceInvalidPhone =
    settings?.maintenanceReminderInvalidPhoneSkippedCount ?? null;
  const paymentInvalidPhone = settings?.paymentReminderInvalidPhoneSkippedCount ?? null;
  const hasSkipData = maintenanceSkipped !== null || paymentSkipped !== null;
  const totalSkipped =
    (maintenanceSkipped ?? 0) +
    (paymentSkipped ?? 0) +
    (maintenanceInvalidPhone ?? 0) +
    (paymentInvalidPhone ?? 0);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-8 py-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold">Messages</h1>
              <p className="text-sm text-slate-500">
                SMS delivery log — did the message actually go out?
              </p>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-slate-50 p-8">
          {error ? (
            <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          {provider !== null ? (
            <p
              className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
                isLive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <span className="font-semibold">
                SMS provider: {provider === 'noop' ? 'NOOP' : provider}
              </span>{' '}
              {isLive
                ? '— messages below were actually sent through this gateway.'
                : '— this is a dev/test deployment. No SMS below actually left the building; set SMS_PROVIDER to a real gateway before relying on delivery.'}
            </p>
          ) : null}

          {hasSkipData && totalSkipped > 0 ? (
            <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">
                {totalSkipped} reminder{totalSkipped === 1 ? '' : 's'} not sent — no consent on
                file or an invalid phone number.
              </span>{' '}
              Maintenance reminders: {maintenanceSkipped ?? '—'} skipped for consent,{' '}
              {maintenanceInvalidPhone ?? '—'} skipped for an invalid phone (last run{' '}
              {formatWhen(settings?.maintenanceReminderConsentSkippedLastRunAt ?? null)}).
              Payment reminders: {paymentSkipped ?? '—'} skipped for consent,{' '}
              {paymentInvalidPhone ?? '—'} skipped for an invalid phone (last run{' '}
              {formatWhen(settings?.paymentReminderConsentSkippedLastRunAt ?? null)}). Record
              consent, or fix the phone number, on the customer or employee record to resume
              sending.
            </p>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Status
              </span>
              <button
                type="button"
                onClick={() => setStatus('')}
                className={
                  statusFilter === ''
                    ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                }
              >
                All
              </button>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={
                    statusFilter === s
                      ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                  }
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
              <span className="ml-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Channel
              </span>
              <button
                type="button"
                onClick={() => setChannel('')}
                className={
                  channelFilter === ''
                    ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                    : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                }
              >
                All
              </button>
              {CHANNEL_FILTERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={
                    channelFilter === c
                      ? 'rounded-lg bg-navy-800 px-3 py-1 text-xs font-medium text-white'
                      : 'rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600'
                  }
                >
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
              <input
                type="date"
                aria-label="From"
                className={`${fieldClass} w-40`}
                value={fromDate}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="date"
                aria-label="To"
                className={`${fieldClass} w-40`}
                value={toDate}
                onChange={(e) => setTo(e.target.value)}
              />
              <div className="ml-auto flex items-center gap-1">
                {(['csv', 'xlsx'] as const).map((format) => (
                  <button
                    key={format}
                    type="button"
                    onClick={() => void onDownload(format)}
                    className={`${btnGhost} px-2 py-1 text-xs uppercase`}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm text-slate-500">No messages match these filters.</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1400px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Created</th>
                        <th className="py-2 pr-4 font-semibold">Sent</th>
                        <th className="py-2 pr-4 font-semibold">Channel</th>
                        <th className="py-2 pr-4 font-semibold">Recipient</th>
                        <th className="py-2 pr-4 font-semibold">Body</th>
                        <th className="py-2 pr-4 font-semibold">Segments</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 pr-4 font-semibold">Attempts</th>
                        <th className="py-2 pr-4 font-semibold">Provider</th>
                        <th className="py-2 pr-4 font-semibold">Subject</th>
                        <th className="py-2 font-semibold">Error / Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((m) => {
                        const link = subjectLink(m.subjectKind, m.subjectId);
                        return (
                          <tr key={m.id} className="border-b border-slate-100 last:border-0">
                            <td className="py-3 pr-4 text-slate-600">
                              {formatWhen(m.createdAt)}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">{formatWhen(m.sentAt)}</td>
                            <td className="py-3 pr-4 text-slate-600">
                              {CHANNEL_LABEL[m.channel]}
                            </td>
                            <td className="py-3 pr-4 font-mono text-xs text-slate-900">
                              {m.recipient}
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className="block max-w-[220px] truncate text-xs text-slate-600"
                                title={m.body}
                              >
                                {m.body}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              <span
                                className={
                                  m.segments > 2
                                    ? 'font-semibold text-amber-700'
                                    : undefined
                                }
                                title={
                                  m.segments > 2
                                    ? 'More than 2 segments — each one beyond the first is a full extra charge.'
                                    : undefined
                                }
                              >
                                {m.segments}
                              </span>
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_BADGE[m.status]}`}
                              >
                                {STATUS_LABEL[m.status]}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-slate-600">{m.attempts}</td>
                            <td className="py-3 pr-4 text-slate-600">
                              {m.providerName ?? '—'}
                            </td>
                            <td className="py-3 pr-4 text-slate-600">
                              {m.subjectKind ? (
                                link ? (
                                  <a
                                    href={link}
                                    className="font-semibold text-navy-800 hover:underline"
                                  >
                                    {m.subjectKind}
                                  </a>
                                ) : (
                                  m.subjectKind
                                )
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap items-start gap-2">
                                {m.status === 'FAILED' && m.lastError ? (
                                  <span
                                    className="max-w-xs truncate text-xs text-red-700"
                                    title={m.lastError}
                                  >
                                    {m.lastError}
                                  </span>
                                ) : null}
                                {canWrite && m.status === 'FAILED' ? (
                                  <button
                                    type="button"
                                    disabled={busyId === m.id}
                                    onClick={() => void onRetry(m)}
                                    className={`${btnPrimary} px-2.5 py-1 text-xs`}
                                  >
                                    {busyId === m.id ? 'Retrying…' : 'Retry'}
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
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
    </div>
  );
}
