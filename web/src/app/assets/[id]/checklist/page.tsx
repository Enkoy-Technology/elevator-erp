'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { btnPrimary, btnSecondary, fieldClass } from '@/components/form-styles';
import { AssignCustomerDialog } from '../../assign-customer-dialog';
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
  moveAsset,
  setAssetSoldTo,
  type AssetEvent,
  type AssetStatus,
  type AssetTracking,
  type UserRole,
} from '@/lib/api';
import { formatDateTime } from '@/lib/datetime';
import {
  ASSET_STATUS_LABEL,
  assetMoveLabel,
  assetNextStepHint,
  canAssignCustomer,
  canMarkParts,
  moveWaitsForCustomer,
  noCustomerText,
} from '../../labels';
import { LiftJourney } from '../../lift-journey';
import { MissingParts, PartsChecklist } from '../../parts-checklist';
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
        : 'Customer removed';
  }
};

const failureText = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

export default function AssetChecklistPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { confirm, confirmDialog } = useConfirm();
  const [tracking, setTracking] = useState<AssetTracking | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [correctTo, setCorrectTo] = useState<AssetStatus | ''>('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parts = useAssetParts(id);
  const { setItems } = parts;

  const isManager = role !== null && MANAGERS.includes(role);

  const reload = useCallback(async () => {
    const next = await getAssetTracking(id);
    setTracking(next);
    return next;
  }, [id]);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setRole(getCurrentRole());
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
  const canAssign = canAssignCustomer(role);
  const hint =
    nextMoves.length > 0
      ? assetNextStepHint(asset.status, {
          hasParts: items.length > 0,
          hasCustomer: asset.customerId !== null,
          canAssign,
        })
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

  const removeCustomer = async () => {
    if (
      (await confirm({
        title: `Remove ${asset.customerName ?? 'the customer'}?`,
        description: `${asset.name} will have no customer until one is assigned.`,
        confirmLabel: 'Remove customer',
        tone: 'danger',
      })) === null
    ) {
      return;
    }
    await run(
      () => setAssetSoldTo(id, null),
      'The customer could not be removed.',
    );
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
        disabled={busy || moveWaitsForCustomer(to, asset.customerId)}
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
      {assigning ? (
        <AssignCustomerDialog
          liftName={asset.name}
          currentId={asset.customerId}
          onPick={(customerId) => {
            setAssigning(false);
            void run(
              () => setAssetSoldTo(id, customerId),
              'The customer could not be saved.',
            );
          }}
          onClose={() => setAssigning(false)}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          eyebrow="Operations"
          title={asset.name}
          description={asset.serialNumber ?? undefined}
          backHref="/assets"
          backLabel="Assets"
          actions={
            nextMoves.length > 0 ? (
              <div className="hidden flex-wrap gap-2 sm:flex">
                {moveButtons()}
              </div>
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

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
            <LiftJourney status={asset.status} />
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
              {hint ? (
                <p className="text-base font-medium text-slate-900">{hint}</p>
              ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-slate-600">
                  Sold to:{' '}
                  <span className="font-semibold text-slate-900">
                    {asset.customerName ?? noCustomerText(asset.status)}
                  </span>
                </p>
                {canAssign ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAssigning(true)}
                    className={asset.customerId ? btnSecondary : btnPrimary}
                  >
                    {asset.customerId ? 'Change customer' : 'Assign customer'}
                  </button>
                ) : null}
                {canAssign && asset.customerId ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeCustomer()}
                    className={`${btnSecondary} text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700`}
                  >
                    Remove customer
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)] xl:items-start">
            {items.length > 0 ? (
              <section aria-label="Parts" className="-mx-4 min-w-0 sm:mx-0">
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

            <div className="min-w-0 space-y-6">
              <MissingParts items={items} />

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
                    {ASSET_STATUSES.filter(
                      (value) => value !== asset.status,
                    ).map((value) => (
                      <option key={value} value={value}>
                        {ASSET_STATUS_LABEL[value]}
                      </option>
                    ))}
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
            </div>
          </div>
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
