'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary, fieldClass } from '@/components/form-styles';
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
  moveAsset,
  optional,
  setAssetSoldTo,
  type AssetEvent,
  type AssetStatus,
  type AssetTracking,
  type Customer,
  type UserRole,
} from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import {
  ASSET_STATUS_LABEL,
  assetMoveLabel,
  assetNextStepHint,
  canMarkParts,
} from '../../labels';
import { LiftJourney } from '../../lift-journey';
import { PartsChecklist } from '../../parts-checklist';
import { useAssetParts } from '../../use-asset-parts';

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
  const parts = useAssetParts(id);
  const { setItems } = parts;

  const isManager = role !== null && MANAGERS.includes(role);
  const canSell = isManager || role === 'SALES_MANAGER';

  const reload = useCallback(async () => {
    const next = await getAssetTracking(id);
    setTracking(next);
    setSoldToDraft(next.asset.customerId ?? '');
    return next;
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    const currentRole = getCurrentRole();
    setRole(currentRole);
    void reload()
      .then((next) => setItems(next.items))
      .catch((err: unknown) => {
        setError(
          failureText(
            err,
            'This lift could not be loaded. It may have been deleted.',
          ),
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
  }, [router, reload, setItems]);

  /** Runs one action that changes the lift, then shows what the server now holds. */
  const run = async (action: () => Promise<unknown>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (err) {
      setError(failureText(err, fallback));
      // The action may have landed and only its reply been lost.
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
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
              <a
                href="/assets"
                className="font-semibold underline underline-offset-2"
              >
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

  const { asset, events, nextMoves } = tracking;
  const { items } = parts;
  const arrived = items.filter((item) => item.mark === 'OK').length;
  const hint =
    nextMoves.length > 0
      ? assetNextStepHint(asset.status, items.length > 0)
      : null;

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
      description:
        'This skips the normal steps and is recorded in the history.',
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

  const moveButtons = (size = '') =>
    nextMoves.map((to, index) => (
      <button
        key={to}
        type="button"
        disabled={busy}
        onClick={() => void press(to)}
        className={`${index === 0 ? btnPrimary : btnSecondary} ${size}`}
      >
        {assetMoveLabel(asset.status, to)}
      </button>
    ));

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
          actions={
            nextMoves.length > 0 ? (
              <div className="hidden flex-wrap gap-2 sm:flex">{moveButtons()}</div>
            ) : undefined
          }
        />

        <main className="flex-1 space-y-6 bg-slate-50 p-4 sm:p-8">
          {error || parts.error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error ?? parts.error}
            </p>
          ) : null}

          <section className="max-w-3xl space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <LiftJourney status={asset.status} />
            {hint ? (
              <p className="text-base font-medium text-slate-900">{hint}</p>
            ) : null}
            <p className="text-sm text-slate-600">
              Sold to{' '}
              <span className="font-semibold text-slate-900">
                {asset.customerName ?? 'nobody yet, in stock'}
              </span>
            </p>
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
            <section aria-label="Parts" className="-mx-4 max-w-3xl sm:mx-0">
              <PartsChecklist
                items={items}
                canMark={canMarkParts(role)}
                savingCases={parts.savingCases}
                failedCases={parts.failedCases}
                saveStates={parts.saveStates}
                onSave={parts.saveItem}
                onCase={(caseNo, mark) => void parts.markCase(caseNo, mark)}
              />
              <p className="mt-3 px-4 text-sm text-slate-500 sm:px-0">
                Quantities start from a 7-floor 450 kg lift. Correct them from
                the paper list that came with this lift.
              </p>
            </section>
          ) : (
            <p className="text-sm text-slate-500">
              This lift has no parts list.
            </p>
          )}

          <section aria-label="History">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">
              History
            </h2>
            <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {events.map((event) => (
                <li key={event.id} className="px-4 py-2.5">
                  <p className="text-sm text-slate-900">
                    {describeEvent(event)}
                  </p>
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
            <section
              aria-label="Correct status"
              className="flex flex-wrap items-center gap-2"
            >
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

        {/* On a phone the next step stays under the thumb, however far down the list. */}
        {nextMoves.length > 0 || items.length > 0 ? (
          <div className="sticky bottom-0 z-20 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:hidden">
            {/* The message at the top of the page may be far off the screen. */}
            {error ? (
              <p className="w-full text-sm font-semibold text-red-700">
                {error}
              </p>
            ) : null}
            {items.length > 0 ? (
              <p className="min-w-0 flex-1 text-sm font-semibold tabular-nums text-slate-900">
                {arrived} of {items.length} arrived
              </p>
            ) : null}
            {moveButtons('px-5 py-3 text-base')}
          </div>
        ) : null}
      </div>
    </div>
  );
}
