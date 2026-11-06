'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { fieldClass } from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import { useConfirm } from '@/components/use-confirm';
import type { AssetChecklistItem, ChecklistMark } from '@/lib/api';
import {
  caseTick,
  hasRowSaving,
  hasSaveFailure,
  summariseCases,
  type CaseSummary,
  type RowSaveState,
  type RowSaveStates,
} from '@/lib/asset-checklist';

export type SaveItem = (
  item: AssetChecklistItem,
  patch: {
    mark?: ChecklistMark;
    quantity?: string | null;
    note?: string | null;
  },
) => Promise<boolean>;

const boxClass = 'h-5 w-5 shrink-0 accent-gold-500 disabled:opacity-60';

const ItemRow = ({
  item,
  canMark,
  busy,
  editableDetails,
  saveState,
  onSave,
}: {
  item: AssetChecklistItem;
  canMark: boolean;
  /** Its whole case is saving: a tick now would race it. */
  busy: boolean;
  editableDetails: boolean;
  saveState: RowSaveState | undefined;
  onSave: SaveItem;
}) => {
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [note, setNote] = useState(item.note ?? '');

  const saveQuantity = async () => {
    if (quantity === (item.quantity ?? '')) {
      return;
    }
    if (!(await onSave(item, { quantity: quantity || null }))) {
      setQuantity(item.quantity ?? '');
    }
  };

  const saveNote = async () => {
    if (note === (item.note ?? '')) {
      return;
    }
    if (!(await onSave(item, { note: note || null }))) {
      setNote(item.note ?? '');
    }
  };

  return (
    <li className="relative py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <label className="flex min-w-0 grow basis-40 cursor-pointer items-start gap-3 break-words">
          <input
            type="checkbox"
            className={`${boxClass} mt-0.5`}
            disabled={!canMark || busy}
            checked={item.mark === 'OK'}
            onChange={(event) =>
              void onSave(item, {
                mark: event.target.checked ? 'OK' : 'MISSING',
              })
            }
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900">
              {item.name}
            </span>
            {item.factoryName !== item.name ? (
              <span className="block text-xs text-slate-500">
                Factory name: {item.factoryName}
              </span>
            ) : null}
            {item.specification ? (
              <span className="block text-xs text-slate-500">
                {item.specification}
              </span>
            ) : null}
          </span>
        </label>
        {editableDetails ? (
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            Quantity
            <input
              aria-label={`Quantity of ${item.name}`}
              className={`${fieldClass} w-24 py-1`}
              disabled={!canMark}
              maxLength={60}
              placeholder="—"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onBlur={() => void saveQuantity()}
            />
            {item.unit === 'M' ? 'm' : null}
          </label>
        ) : (
          <span className="text-xs text-slate-500">
            Quantity {item.quantity ?? '—'}
            {item.unit === 'M' ? ' m' : ''}
          </span>
        )}
      </div>

      {editableDetails && (item.mark !== 'OK' || item.note) ? (
        <input
          aria-label={`Note on ${item.name}`}
          className={`${fieldClass} mt-2 py-1.5`}
          disabled={!canMark}
          maxLength={500}
          placeholder="What is wrong, how many are short"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => void saveNote()}
        />
      ) : null}

      {/* Out of the flow: rows moving under a thumb would send the next tap to the wrong one. */}
      {saveState === 'saving' ? (
        <p className="absolute right-0 bottom-1 text-xs text-slate-500">
          Saving…
        </p>
      ) : null}
      {saveState === 'failed' ? (
        <p role="alert" className="mt-1.5 text-xs font-medium text-red-700">
          That was not saved. Check the connection and try again.
        </p>
      ) : null}
    </li>
  );
};

const CaseSection = ({
  summary,
  items,
  canMark,
  editableDetails,
  busy,
  saveStates,
  onSave,
  onTapCase,
}: {
  summary: CaseSummary;
  items: readonly AssetChecklistItem[];
  canMark: boolean;
  editableDetails: boolean;
  busy: boolean;
  saveStates: RowSaveStates;
  onSave: SaveItem;
  onTapCase: (summary: CaseSummary) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { caseNo, boxNames, total, arrived, short } = summary;
  const tick = caseTick(summary);
  const notSaved = hasSaveFailure(items, saveStates);

  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <input
          type="checkbox"
          aria-label={`All of case ${caseNo} arrived`}
          className={`${boxClass} mt-0.5`}
          disabled={!canMark || busy || hasRowSaving(items, saveStates)}
          checked={tick === 'all'}
          ref={(box) => {
            if (box) {
              box.indeterminate = tick === 'some';
            }
          }}
          onChange={() => onTapCase(summary)}
        />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex w-full items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-900">
                Case {caseNo}
              </span>
              <span className="block text-xs text-slate-500">
                {boxNames.join(', ')}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
            />
          </button>
          {/* A line of its own: a pill appearing must not push the rows below it down. */}
          <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-xs tabular-nums text-slate-500">
              {arrived} of {total}
            </span>
            {notSaved ? <StatusPill label="Not saved" tone="danger" /> : null}
            {short > 0 ? (
              <StatusPill label={`${short} missing`} tone="warn" />
            ) : null}
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4">
          {boxNames.map((boxName) => (
            <div key={boxName}>
              {boxNames.length > 1 ? (
                <h3 className="pt-3 text-xs font-semibold text-slate-500">
                  {boxName}
                </h3>
              ) : null}
              <ul className="divide-y divide-slate-200">
                {items
                  .filter((item) => item.boxName === boxName)
                  .map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      canMark={canMark}
                      busy={busy}
                      editableDetails={editableDetails}
                      saveState={saveStates[item.id]}
                      onSave={onSave}
                    />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};

/**
 * The parts of one lift as a tick list. A lift comes with its parts, so every
 * part starts ticked and people untick what did not come, or a whole case.
 * `editableDetails` is off on the register form, where there is no lift yet to
 * save a quantity or note on.
 */
export const PartsChecklist = ({
  items,
  canMark,
  editableDetails = true,
  savingCases = new Set(),
  saveStates = {},
  onSave,
  onCase,
}: {
  items: readonly AssetChecklistItem[];
  canMark: boolean;
  editableDetails?: boolean;
  savingCases?: ReadonlySet<number>;
  saveStates?: RowSaveStates;
  onSave: SaveItem;
  onCase: (caseNo: number, mark: ChecklistMark) => void;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const cases = summariseCases(items);
  const arrived = cases.reduce((sum, entry) => sum + entry.arrived, 0);

  const tapCase = async (entry: CaseSummary) => {
    const tick = caseTick(entry);
    const unticked = entry.total - entry.arrived;
    // One tap here would wipe every untick in the case, with no way back.
    if (
      tick === 'some' &&
      (await confirm({
        title: `Tick all of case ${entry.caseNo}?`,
        description: `${unticked} unticked ${unticked === 1 ? 'part' : 'parts'} will show as arrived.`,
        confirmLabel: 'Tick all',
      })) === null
    ) {
      return;
    }
    onCase(entry.caseNo, tick === 'all' ? 'MISSING' : 'OK');
  };

  return (
    <div
      onKeyDown={(event) => {
        // Inside a form, Enter would submit it and leave the page.
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          event.target.blur();
        }
      }}
    >
      {confirmDialog}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-slate-500">
          Every part is ticked as arrived. Untick what did not come.
          {editableDetails
            ? ' Each tick saves straight away.'
            : ' Quantities can be corrected after registering.'}
        </p>
        <p className="text-xs tabular-nums text-slate-500">
          {arrived} of {items.length} arrived
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {cases.map((entry) => (
          <CaseSection
            key={entry.caseNo}
            summary={entry}
            items={items.filter((item) => item.caseNo === entry.caseNo)}
            canMark={canMark}
            editableDetails={editableDetails}
            busy={savingCases.has(entry.caseNo)}
            saveStates={saveStates}
            onSave={onSave}
            onTapCase={(summary) => void tapCase(summary)}
          />
        ))}
      </div>
    </div>
  );
};
