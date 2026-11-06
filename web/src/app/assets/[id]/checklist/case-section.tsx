'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { btnSecondary, fieldClass } from '@/components/form-styles';
import { StatusPill } from '@/components/list-toolbar';
import {
  CHECKLIST_MARKS,
  type AssetChecklistItem,
  type ChecklistMark,
} from '@/lib/api';
import {
  hasSaveFailure,
  type CaseSummary,
  type RowSaveState,
  type RowSaveStates,
} from '@/lib/asset-checklist';
import { CHECKLIST_MARK_LABEL } from '../../labels';

export type SaveItem = (
  item: AssetChecklistItem,
  patch: {
    mark?: ChecklistMark;
    quantity?: string | null;
    note?: string | null;
  },
) => Promise<boolean>;

const MARK_ON: Record<ChecklistMark, string> = {
  OK: 'border-emerald-600 bg-emerald-600 text-white',
  MISSING: 'border-red-600 bg-red-600 text-white',
  DAMAGED: 'border-amber-500 bg-amber-500 text-navy-950',
  NOT_INCLUDED: 'border-slate-600 bg-slate-600 text-white',
};

const ItemRow = ({
  item,
  canMark,
  saveState,
  onSave,
}: {
  item: AssetChecklistItem;
  canMark: boolean;
  saveState: RowSaveState | undefined;
  onSave: SaveItem;
}) => {
  const [quantity, setQuantity] = useState(item.quantity ?? '');
  const [note, setNote] = useState(item.note ?? '');
  const [noteOpen, setNoteOpen] = useState(false);

  const saveQuantity = async () => {
    if (quantity === (item.quantity ?? '')) {
      return;
    }
    const saved = await onSave(item, { quantity: quantity || null });
    if (!saved) {
      setQuantity(item.quantity ?? '');
    }
  };

  const saveNote = async () => {
    if (note === (item.note ?? '')) {
      return;
    }
    const saved = await onSave(item, { note: note || null });
    if (!saved) {
      setNote(item.note ?? '');
    }
  };

  const showNote =
    noteOpen || Boolean(item.note) || (item.mark !== null && item.mark !== 'OK');

  return (
    <li className="relative py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-48 flex-1 break-words">
          <p className="text-sm font-medium text-slate-900">{item.name}</p>
          {item.factoryName !== item.name ? (
            <p className="text-xs text-slate-500">
              Factory name: {item.factoryName}
            </p>
          ) : null}
          {item.specification ? (
            <p className="text-xs text-slate-500">{item.specification}</p>
          ) : null}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          Quantity
          <input
            aria-label={`Quantity of ${item.name}`}
            className={`${fieldClass} w-28 py-1`}
            disabled={!canMark}
            maxLength={60}
            placeholder="—"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onBlur={() => void saveQuantity()}
          />
          {item.unit === 'M' ? 'm' : null}
        </label>
      </div>

      <div
        role="group"
        aria-label={`Mark ${item.name}`}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {CHECKLIST_MARKS.map((value) => (
          <button
            key={value}
            type="button"
            disabled={!canMark}
            aria-pressed={item.mark === value}
            onClick={() => void onSave(item, { mark: value })}
            className={`min-h-9 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 disabled:cursor-not-allowed disabled:opacity-60 ${
              item.mark === value
                ? MARK_ON[value]
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {CHECKLIST_MARK_LABEL[value]}
          </button>
        ))}
        {canMark && !showNote ? (
          <button
            type="button"
            onClick={() => setNoteOpen(true)}
            className="min-h-9 rounded-lg px-2 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Add note
          </button>
        ) : null}
      </div>

      {showNote ? (
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
        <p className="absolute right-0 bottom-3 text-xs text-slate-500">
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

export const CaseSection = ({
  summary,
  items,
  canMark,
  busy,
  saveStates,
  onSave,
  onAllOk,
}: {
  summary: CaseSummary;
  items: readonly AssetChecklistItem[];
  canMark: boolean;
  busy: boolean;
  saveStates: RowSaveStates;
  onSave: SaveItem;
  onAllOk: (caseNo: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { caseNo, boxNames, total, marked, short } = summary;
  const unmarked = total - marked;
  const notSaved = hasSaveFailure(items, saveStates);

  return (
    <section className="border-b border-slate-200 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500"
        >
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">
              Case {caseNo}
            </span>
            <span className="block text-xs text-slate-500">
              {boxNames.join(', ')}
            </span>
          </span>
        </button>
        <span className="text-xs tabular-nums text-slate-500">
          {marked} of {total}
        </span>
        {notSaved ? <StatusPill label="Not saved" tone="danger" /> : null}
        {short > 0 ? <StatusPill label={`${short} short`} tone="warn" /> : null}
        {unmarked === 0 && short === 0 && !notSaved ? (
          <StatusPill label="Done" tone="good" />
        ) : null}
        {canMark && unmarked > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAllOk(caseNo)}
            className={`${btnSecondary} px-2.5 py-1 text-xs`}
          >
            All OK
          </button>
        ) : null}
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
