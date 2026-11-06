'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary, fieldClass } from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import { PageHeader } from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { useConfirm } from '@/components/use-confirm';
import {
  ApiError,
  ASSET_STATUSES,
  correctAssetStatus,
  getAccessToken,
  getAssetTracking,
  getCurrentRole,
  listCustomers,
  markChecklistCaseOk,
  moveAsset,
  optional,
  setAssetSoldTo,
  updateChecklistItem,
  type AssetEvent,
  type AssetStatus,
  type AssetTracking,
  type Customer,
  type UserRole,
} from '@/lib/api';
import {
  summariseCases,
  withMark,
  withoutFailures,
  withSaveState,
  type RowSaveStates,
} from '@/lib/asset-checklist';
import { formatDateTime } from '@/lib/datetime';
import {
  ASSET_STATUS_LABEL,
  ASSET_STATUS_TONE,
  assetMoveLabel,
} from '../../labels';
import { CaseSection, type SaveItem } from './case-section';

const MANAGERS: readonly UserRole[] = ['GENERAL_MANAGER', 'CEO', 'ADMIN'];

const describeEvent = (event: AssetEvent): string => {
  const to = event.toStatus ? ASSET_STATUS_LABEL[event.toStatus] : '';
  const from = event.fromStatus ? ASSET_STATUS_LABEL[event.fromStatus] : '';
  switch (event.kind) {
    case 'REGISTERED':
      return `Registered as ${to}`;
    case 'STATUS':
      return `${from} to ${to}`;
    case 'CORRECTED':
      return `Corrected from ${from} to ${to}`;
    case 'SOLD_TO':
      return event.customerName
        ? `Sold to ${event.customerName}`
        : 'Back in stock';
  }
};

const failureText = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

export default function AssetChecklistPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { confirm, confirmDialog } = useConfirm();
  const [tracking, setTracking] = useState<AssetTracking | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [soldToDraft, setSoldToDraft] = useState('');
  const [correctTo, setCorrectTo] = useState<AssetStatus | ''>('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Kept here because closing a case unmounts its rows, and a failure must outlive that. */
  const [saveStates, setSaveStates] = useState<RowSaveStates>({});
  /** Rows with a mark on its way, so a second tap cannot race the first. */
  const marking = useRef(new Set<string>());

  const isManager = role !== null && MANAGERS.includes(role);
  const canMark = isManager || role === 'STORE_KEEPER' || role === 'TECHNICAL_MANAGER';
  const canSell = isManager || role === 'SALES_MANAGER';

  const reload = useCallback(async () => {
    const next = await getAssetTracking(id);
    setTracking(next);
    setSoldToDraft(next.asset.customerId ?? '');
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    const currentRole = getCurrentRole();
    setRole(currentRole);
    void reload().catch((err: unknown) => {
      setError(
        failureText(err, 'This lift could not be loaded. It may have been deleted.'),
      );
    });
    if (
      currentRole === 'SALES_MANAGER' ||
      (currentRole && MANAGERS.includes(currentRole))
    ) {
      void optional(listCustomers({ page: 1, pageSize: 100 })).then((result) =>
        setCustomers(result.items),
      );
    }
  }, [router, reload]);

  const cases = useMemo(
    () => summariseCases(tracking?.items ?? []),
    [tracking?.items],
  );

  /** Runs one action that changes the lift, then shows what the server now holds. */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      setSaveStates(withoutFailures);
    } catch (err) {
      setError(failureText(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  /** Shows a mark at once and saves it alone, so a power cut loses one tick at most. */
  const saveItem: SaveItem = async (item, patch) => {
    if (patch.mark) {
      if (marking.current.has(item.id)) {
        return true;
      }
      marking.current.add(item.id);
    }
    setError(null);
    setSaveStates((states) => withSaveState(states, item.id, 'saving'));
    const setItems = (
      change: (items: AssetTracking['items']) => AssetTracking['items'],
    ) =>
      setTracking(
        (current) => current && { ...current, items: change(current.items) },
      );
    if (patch.mark) {
      setItems((rows) => withMark(rows, item.id, patch.mark ?? null));
    }
    try {
      await updateChecklistItem(id, item.id, patch);
      setItems((rows) =>
        rows.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
      );
      setSaveStates((states) => withSaveState(states, item.id, null));
      return true;
    } catch {
      if (patch.mark) {
        setItems((rows) => withMark(rows, item.id, item.mark));
      }
      setSaveStates((states) => withSaveState(states, item.id, 'failed'));
      // The save may have landed and only its reply been lost: show what the
      // server holds, if it can be reached at all.
      void reload().catch(() => undefined);
      return false;
    } finally {
      if (patch.mark) {
        marking.current.delete(item.id);
      }
    }
  };

  if (!tracking) {
    return (
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 p-6 sm:p-8">
          {error ? (
            <p
              role="alert"
              className="max-w-2xl rounded-xl border-l-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}{' '}
              <a href="/assets" className="font-semibold underline underline-offset-2">
                Back to assets
              </a>
            </p>
          ) : (
            <p className="text-sm text-slate-500">Loading lift…</p>
          )}
        </div>
      </div>
    );
  }

  const { asset, items, events, nextMoves } = tracking;
  const short = cases.reduce((sum, entry) => sum + entry.short, 0);
  const marked = cases.reduce((sum, entry) => sum + entry.marked, 0);

  const press = async (to: AssetStatus) => {
    if (
      to === 'DECOMMISSIONED' &&
      (await confirm({
        title: `Decommission ${asset.name}?`,
        description: 'This ends the lift’s life in the system.',
        confirmLabel: 'Decommission',
        tone: 'danger',
      })) === null
    ) {
      return;
    }
    await run(() => moveAsset(id, to), 'The lift could not be moved.');
  };

  const correct = async () => {
    if (!correctTo) {
      return;
    }
    const reason = await confirm({
      title: `Correct status to ${ASSET_STATUS_LABEL[correctTo]}?`,
      description: 'This skips the normal steps and is recorded in the history.',
      confirmLabel: 'Correct status',
      input: { label: 'Reason', minLength: 3 },
    });
    if (reason === null) {
      return;
    }
    await run(
      () => correctAssetStatus(id, correctTo, reason),
      'The status could not be corrected.',
    );
    setCorrectTo('');
  };

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      {confirmDialog}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Operations"
          title={asset.name}
          description={asset.serialNumber ?? undefined}
          backHref="/assets"
          backLabel="Assets"
          actions={nextMoves.map((to, index) => (
            <button
              key={to}
              type="button"
              disabled={busy}
              onClick={() => void press(to)}
              className={index === 0 ? btnPrimary : btnSecondary}
            >
              {assetMoveLabel(asset.status, to)}
            </button>
          ))}
        />

        <main className="flex-1 space-y-6 bg-slate-50 p-4 sm:p-8">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <section className="flex flex-wrap items-end gap-x-8 gap-y-4 rounded-xl border border-slate-200 bg-white p-4">
            <div>
              <p className="text-xs font-semibold text-slate-500">Where it is</p>
              <p className="mt-1 flex flex-wrap gap-1">
                <StatusPill
                  label={ASSET_STATUS_LABEL[asset.status]}
                  tone={ASSET_STATUS_TONE[asset.status]}
                />
                {short > 0 ? (
                  <StatusPill label={`${short} short`} tone="warn" />
                ) : null}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-500">Sold to</p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {asset.customerName ?? 'In stock'}
              </p>
            </div>
            {canSell ? (
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Who this lift is sold to"
                  className={`${fieldClass} w-56 max-w-full`}
                  value={soldToDraft}
                  onChange={(event) => setSoldToDraft(event.target.value)}
                >
                  <option value="">In stock</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || soldToDraft === (asset.customerId ?? '')}
                  onClick={() =>
                    void run(
                      () => setAssetSoldTo(id, soldToDraft || null),
                      'Who it is sold to could not be saved.',
                    )
                  }
                  className={btnSecondary}
                >
                  Save sold to
                </button>
              </div>
            ) : null}
          </section>

          {items.length > 0 ? (
            <section aria-label="Packing list">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">
                  Packing list
                </h2>
                <p className="text-xs tabular-nums text-slate-500">
                  {marked} of {items.length} marked
                </p>
              </div>
              <p className="mb-3 text-xs text-slate-500">
                Quantities start from a 7-floor 450 kg lift. Correct them from
                the paper list that came with this lift.
              </p>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {cases.map((entry) => (
                  <CaseSection
                    key={entry.caseNo}
                    summary={entry}
                    items={items.filter((item) => item.caseNo === entry.caseNo)}
                    canMark={canMark}
                    busy={busy}
                    saveStates={saveStates}
                    onSave={saveItem}
                    onAllOk={(caseNo) =>
                      void run(
                        () => markChecklistCaseOk(id, caseNo),
                        'That case could not be marked.',
                      )
                    }
                  />
                ))}
              </div>
            </section>
          ) : (
            <p className="text-sm text-slate-500">This lift has no packing list.</p>
          )}

          <section aria-label="History">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">History</h2>
            <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {events.map((event) => (
                <li key={event.id} className="px-4 py-2.5">
                  <p className="text-sm text-slate-900">{describeEvent(event)}</p>
                  {event.note ? (
                    <p className="text-sm text-slate-600">{event.note}</p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {event.createdByName ?? 'Unknown'},{' '}
                    {formatDateTime(event.createdAt)}
                  </p>
                </li>
              ))}
              {events.length === 0 ? (
                <li className="px-4 py-2.5 text-sm text-slate-500">
                  Nothing recorded yet.
                </li>
              ) : null}
            </ol>
          </section>

          {isManager ? (
            <section aria-label="Correct status" className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Correct status to"
                className={`${fieldClass} w-56 max-w-full`}
                value={correctTo}
                onChange={(event) =>
                  setCorrectTo(event.target.value as AssetStatus | '')
                }
              >
                <option value="">Choose a status</option>
                {ASSET_STATUSES.filter((value) => value !== asset.status).map(
                  (value) => (
                    <option key={value} value={value}>
                      {ASSET_STATUS_LABEL[value]}
                    </option>
                  ),
                )}
              </select>
              <button
                type="button"
                disabled={busy || !correctTo}
                onClick={() => void correct()}
                className={btnSecondary}
              >
                Correct status
              </button>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
