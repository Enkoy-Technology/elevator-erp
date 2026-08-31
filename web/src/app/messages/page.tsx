'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  btnGhost,
  btnSecondary,
  fieldClass,
  metaLabelClass,
} from '@/components/form-styles';
import { DataTable } from '@/components/data-table';
import { FilterSelect, ListToolbar, StatusPill } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
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
import { formatNumber } from '@/lib/money';


const STATUS_LABEL: Record<MessageStatus, string> = {
  QUEUED: 'Queued',
  SENDING: 'Sending',
  SENT: 'Sent',
  FAILED: 'Failed',
};

/** One place decides what a delivery status looks like; StatusPill owns the paint. */
const STATUS_TONE: Record<MessageStatus, 'neutral' | 'active' | 'good' | 'warn' | 'danger'> = {
  QUEUED: 'warn',
  SENDING: 'active',
  SENT: 'good',
  FAILED: 'danger',
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

/**
 * "Export selected" — a CSV of exactly the rows that are ticked, built from
 * the page's already-loaded data. The toolbar's CSV/XLSX buttons are a
 * different thing: those export the whole filtered set, server-side.
 *
 * ponytail: duplicated in the other list pages rather than lifted into
 * @/lib/csv, because those files are being edited concurrently. Lift it into
 * one module once they have landed.
 */
const downloadCsv = (
  filename: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): void => {
  // Quote every cell, and neutralise a leading =/+/-/@ so that a crafted
  // value (a message body, a provider error) opens as text in a spreadsheet
  // rather than as a formula.
  const cell = (value: string): string =>
    `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  // BOM: Excel needs it to read UTF-8 (Amharic message bodies) correctly.
  const url = URL.createObjectURL(
    new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

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
  const [pageSize, setPageSize] = useState(10);
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
  // Cleared whenever the rows underneath it change (see refresh) — an id
  // whose row is no longer loaded cannot be exported.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const refresh = useCallback(
    async (
      nextPage: number,
      status: MessageStatus | '',
      channel: MessageChannel | '',
      from: string,
      to: string,
      size: number,
    ) => {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      try {
        const result = await listOutbox({
          status: status || undefined,
          channel: channel || undefined,
          from: from || undefined,
          to: to || undefined,
          page: nextPage,
          pageSize: size,
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
    void refresh(page, statusFilter, channelFilter, fromDate, toDate, pageSize);
  }, [refresh, page, statusFilter, channelFilter, fromDate, toDate, pageSize]);

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
      await refresh(page, statusFilter, channelFilter, fromDate, toDate, pageSize);
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

  // An outbound message log is a record of what was already sent: there is
  // nothing on it to edit and nothing to delete, so the only bulk operation
  // it can honestly offer is taking a copy of the rows away with you.
  const exportSelected = () => {
    const rows = items.filter((message) => selected.has(message.id));
    downloadCsv(
      'messages.csv',
      [
        'Created',
        'Sent',
        'Channel',
        'Recipient',
        'Body',
        'Segments',
        'Status',
        'Attempts',
        'Provider',
        'Subject',
        'Last error',
      ],
      rows.map((message) => [
        message.createdAt,
        message.sentAt ?? '',
        CHANNEL_LABEL[message.channel],
        message.recipient,
        message.body,
        String(message.segments),
        STATUS_LABEL[message.status],
        String(message.attempts),
        message.providerName ?? '',
        message.subjectKind ?? '',
        message.lastError ?? '',
      ]),
    );
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

  const columns: ColumnDef<OutboundMessage, unknown>[] = [
    { id: 'createdAt', header: 'Created', cell: ({ row }) => formatWhen(row.original.createdAt) },
    { id: 'sentAt', header: 'Sent', cell: ({ row }) => formatWhen(row.original.sentAt) },
    { id: 'channel', header: 'Channel', cell: ({ row }) => CHANNEL_LABEL[row.original.channel] },
    {
      id: 'recipient',
      header: 'Recipient',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-900">{row.original.recipient}</span>
      ),
    },
    {
      id: 'body',
      header: 'Body',
      cell: ({ row }) => (
        <span className="block max-w-[220px] truncate text-xs text-slate-600" title={row.original.body}>
          {row.original.body}
        </span>
      ),
    },
    {
      id: 'segments',
      header: 'Segments',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span
          className={row.original.segments > 2 ? 'font-semibold text-amber-700' : undefined}
          title={
            row.original.segments > 2
              ? 'More than 2 segments \u2014 each one beyond the first is a full extra charge.'
              : undefined
          }
        >
          {formatNumber(row.original.segments)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusPill label={STATUS_LABEL[row.original.status]} tone={STATUS_TONE[row.original.status]} />
      ),
    },
    {
      id: 'attempts',
      header: 'Attempts',
      meta: { align: 'right' },
      cell: ({ row }) => formatNumber(row.original.attempts),
    },
    { id: 'providerName', header: 'Provider', cell: ({ row }) => row.original.providerName ?? '\u2014' },
    {
      id: 'subject',
      header: 'Subject',
      cell: ({ row }) => {
        const link = subjectLink(row.original.subjectKind, row.original.subjectId);
        if (!row.original.subjectKind) {
          return '\u2014';
        }
        return link ? (
          <a href={link} className="font-semibold text-navy-800 hover:underline">
            {row.original.subjectKind}
          </a>
        ) : (
          row.original.subjectKind
        );
      },
    },
    {
      id: 'actions',
      header: 'Error / Actions',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {row.original.status === 'FAILED' && row.original.lastError ? (
            <span className="max-w-xs truncate text-xs text-red-700" title={row.original.lastError}>
              {row.original.lastError}
            </span>
          ) : null}
          {canWrite && row.original.status === 'FAILED' ? (
            <button
              type="button"
              disabled={busyId === row.original.id}
              onClick={() => void onRetry(row.original)}
              className={`${btnSecondary} px-2.5 py-1 text-xs`}
            >
              {busyId === row.original.id ? 'Retrying\u2026' : 'Retry'}
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Money"
          title="Messages"
          description="The SMS delivery log: what was sent, what it cost in segments, and what failed. Retry a failure from its row."
        />

        <main className="flex-1 bg-slate-50 p-4 sm:p-8">
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
                {formatNumber(totalSkipped)} reminder{totalSkipped === 1 ? '' : 's'} not sent — no consent on
                file or an invalid phone number.
              </span>{' '}
              Maintenance reminders: {formatNumber(maintenanceSkipped)} skipped for consent,{' '}
              {formatNumber(maintenanceInvalidPhone)} skipped for an invalid phone (last run{' '}
              {formatWhen(settings?.maintenanceReminderConsentSkippedLastRunAt ?? null)}).
              Payment reminders: {formatNumber(paymentSkipped)} skipped for consent,{' '}
              {formatNumber(paymentInvalidPhone)} skipped for an invalid phone (last run{' '}
              {formatWhen(settings?.paymentReminderConsentSkippedLastRunAt ?? null)}). Record
              consent, or fix the phone number, on the customer or employee record to resume
              sending.
            </p>
          ) : null}

          <ListToolbar
            filters={
              <>
                <FilterSelect
                  label="Status"
                  value={statusFilter}
                  onChange={setStatus}
                  options={STATUS_FILTERS.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                  allLabel="All statuses"
                />
                <FilterSelect
                  label="Channel"
                  value={channelFilter}
                  onChange={setChannel}
                  options={CHANNEL_FILTERS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
                  allLabel="All channels"
                />
                <div>
                  <label className={`mb-1 block ${metaLabelClass} font-semibold`} htmlFor="from-date">
                    From
                  </label>
                  <input
                    id="from-date"
                    type="date"
                    className={`${fieldClass} w-40`}
                    value={fromDate}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className={`mb-1 block ${metaLabelClass} font-semibold`} htmlFor="to-date">
                    To
                  </label>
                  <input
                    id="to-date"
                    type="date"
                    className={`${fieldClass} w-40`}
                    value={toDate}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </>
            }
            actions={(['csv', 'xlsx'] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => void onDownload(format)}
                className={`${btnGhost} px-2 py-1 text-xs uppercase`}
              >
                {format}
              </button>
            ))}
          />

          <DataTable
            columns={columns}
            rows={items}
            getRowId={(message) => message.id}
            getRowLabel={(message) =>
              `${CHANNEL_LABEL[message.channel]} to ${message.recipient}`
            }
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            bulkActions={
              <button
                type="button"
                onClick={exportSelected}
                className={`${btnSecondary} px-2.5 py-1 text-xs`}
              >
                Export selected
              </button>
            }
            loading={loading}
            caption="Message log"
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
            empty="No messages match these filters. Set Status to All statuses and widen the date range \u2014 reminders only appear here once a scheduled run has sent them."
          />
        </main>
      </div>
    </div>
  );
}
