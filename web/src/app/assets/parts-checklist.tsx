'use client';

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

import { btnSecondary, fieldClass } from '@/components/form-styles';
import { useConfirm } from '@/components/use-confirm';
import type { AssetChecklistItem, ChecklistMark } from '@/lib/api';
import {
  caseStateText,
  caseTick,
  detailKey,
  hasRowSaving,
  hasSaveFailure,
  partsHeadline,
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

const PartState = ({
  arrived,
  saveState,
  detailState,
}: {
  arrived: boolean;
  saveState: RowSaveState | undefined;
  detailState: RowSaveState | undefined;
}) => {
  if (saveState === 'failed' || detailState === 'failed') {
    return (
      <span role="alert" className="font-semibold text-red-700">
        {saveState === 'failed' ? 'Not saved, tap again' : 'Details not saved'}
      </span>
    );
  }
  if (saveState === 'saving' || detailState === 'saving') {
    return <span className="font-semibold text-slate-500">Saving…</span>;
  }
  return (
    <span
      className={`font-semibold ${arrived ? 'text-emerald-700' : 'text-red-700'}`}
    >
      {arrived ? 'Arrived' : 'Missing'}
    </span>
  );
};

const PartRow = ({
  item,
  canMark,
  busy,
  editableDetails,
  saveState,
  detailState,
  onSave,
}: {
  item: AssetChecklistItem;
  canMark: boolean;
  /** Its whole case is saving: a tap now would race it. */
  busy: boolean;
  editableDetails: boolean;
  saveState: RowSaveState | undefined;
  detailState: RowSaveState | undefined;
  onSave: SaveItem;
}) => {
  // Null until the person types: the boxes follow the lift, and leaving one
  // untouched can never write an old value back.
  const [quantityDraft, setQuantityDraft] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const arrived = item.mark === 'OK';
  const unit = item.unit === 'M' ? ' m' : '';
  const hasFactoryName = item.factoryName !== item.name;
  const hasDetails =
    editableDetails || hasFactoryName || Boolean(item.specification);

  // A failed save keeps what was typed, so leaving the box again retries it.
  const saveDetail = async (
    field: 'quantity' | 'note',
    draft: string | null,
    setDraft: Dispatch<SetStateAction<string | null>>,
  ) => {
    if (draft === null) {
      return;
    }
    const unchanged = draft === (item[field] ?? '');
    if (
      (unchanged && detailState !== 'failed') ||
      (await onSave(item, { [field]: draft || null }))
    ) {
      // Anything typed during a slow save stays, for the next one.
      setDraft((current) => (current === draft ? null : current));
    }
  };

  return (
    <li className={arrived ? 'bg-white' : 'bg-red-50'}>
      <div className="relative">
        <label
          className={`flex items-start gap-3 px-3 py-3 ${canMark ? 'cursor-pointer active:bg-slate-100' : ''}`}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            disabled={!canMark || busy}
            checked={arrived}
            onChange={(event) =>
              void onSave(item, {
                mark: event.target.checked ? 'OK' : 'MISSING',
              })
            }
          />
          <span
            aria-hidden
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-gold-500 ${
              arrived
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-red-600 text-white'
            }`}
          >
            {arrived ? (
              <Check strokeWidth={3} className="h-5 w-5" />
            ) : (
              <X strokeWidth={3} className="h-5 w-5" />
            )}
          </span>
          {/* The state replaces its own word, so saving never moves a row under a thumb. */}
          <span className="min-w-0 flex-1 break-words">
            <span className="block text-[15px] font-semibold leading-snug text-slate-900">
              {item.name}
            </span>
            <span className="mt-0.5 flex items-baseline gap-2 pr-16 text-sm">
              <PartState
                arrived={arrived}
                saveState={saveState}
                detailState={detailState}
              />
              {item.quantity ? (
                <span className="truncate text-slate-500">
                  Quantity {item.quantity}
                  {unit}
                </span>
              ) : null}
            </span>
            {item.note ? (
              <span className="mt-0.5 block pr-16 text-sm text-slate-600">
                Note: {item.note}
              </span>
            ) : null}
          </span>
        </label>

        {hasDetails ? (
          <button
            type="button"
            aria-expanded={detailsOpen}
            aria-label={`Details of ${item.name}`}
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="absolute bottom-1 right-1 rounded px-2 py-2 text-sm font-medium text-slate-600 underline underline-offset-2"
          >
            Details
          </button>
        ) : null}
      </div>

      {detailsOpen ? (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50 px-3 py-3">
          {hasFactoryName ? (
            <p className="text-sm text-slate-600">
              Name on the factory list: {item.factoryName}
            </p>
          ) : null}
          {item.specification ? (
            <p className="text-sm text-slate-600">{item.specification}</p>
          ) : null}
          {editableDetails ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Quantity on your paper list{unit ? ' (metres)' : ''}
                <input
                  className={`${fieldClass} mt-1`}
                  disabled={!canMark}
                  maxLength={60}
                  value={quantityDraft ?? item.quantity ?? ''}
                  onChange={(event) => setQuantityDraft(event.target.value)}
                  onBlur={() =>
                    void saveDetail('quantity', quantityDraft, setQuantityDraft)
                  }
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Note
                <input
                  className={`${fieldClass} mt-1`}
                  disabled={!canMark}
                  maxLength={500}
                  placeholder="What is wrong, how many are short"
                  value={noteDraft ?? item.note ?? ''}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  onBlur={() =>
                    void saveDetail('note', noteDraft, setNoteDraft)
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};

const CaseSection = ({
  summary,
  items,
  canMark,
  editableDetails,
  open,
  busy,
  failed,
  saveStates,
  onToggle,
  onSave,
  onTapCase,
}: {
  summary: CaseSummary;
  items: readonly AssetChecklistItem[];
  canMark: boolean;
  editableDetails: boolean;
  open: boolean;
  busy: boolean;
  /** A save of the whole case came back with an error. */
  failed: boolean;
  saveStates: RowSaveStates;
  onToggle: () => void;
  onSave: SaveItem;
  onTapCase: (summary: CaseSummary) => void;
}) => {
  const section = useRef<HTMLElement>(null);
  const head = useRef<HTMLButtonElement>(null);
  const { caseNo, boxNames, short } = summary;
  const allArrived = caseTick(summary) === 'all';
  const notSaved = failed || hasSaveFailure(items, saveStates);

  // Opening a case closes the one above it, which would leave this one off the screen.
  useEffect(() => {
    if (open) {
      section.current?.scrollIntoView({ block: 'start' });
    }
  }, [open]);

  return (
    <section
      ref={section}
      className="scroll-mt-36 border-b border-slate-200 last:border-b-0"
    >
      <button
        ref={head}
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-slate-50 active:bg-slate-100"
      >
        {/* The number painted on the crate is how a person finds this row. */}
        <span
          className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md text-white ${short > 0 ? 'bg-red-600' : 'bg-navy-900'}`}
        >
          <span className="text-[11px] leading-none">Case</span>
          <span className="font-display text-2xl font-bold leading-tight tabular-nums">
            {caseNo}
          </span>
        </span>
        <span className="min-w-0 flex-1 break-words">
          <span className="block text-base font-semibold leading-snug text-slate-900">
            {boxNames.join(', ')}
          </span>
          <span
            className={`mt-0.5 block text-sm font-semibold ${short > 0 ? 'text-red-700' : 'text-emerald-700'}`}
          >
            {caseStateText(summary)}
          </span>
          {notSaved ? (
            <span className="block text-sm font-semibold text-red-700">
              Not saved. Check the connection and try again.
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-5 w-5 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open ? (
        <div className="border-t border-slate-200 bg-slate-100">
          {canMark ? (
            <div className="p-3">
              <button
                type="button"
                disabled={busy || hasRowSaving(items, saveStates)}
                onClick={() => onTapCase(summary)}
                className={`${btnSecondary} w-full py-3`}
              >
                {busy
                  ? 'Saving…'
                  : allArrived
                    ? `None of case ${caseNo} came`
                    : `All of case ${caseNo} came`}
              </button>
            </div>
          ) : null}
          {boxNames.map((boxName) => (
            <div key={boxName}>
              {boxNames.length > 1 ? (
                <h3 className="px-3 pb-1.5 pt-3 text-sm font-semibold text-slate-600">
                  {boxName}
                </h3>
              ) : null}
              <ul className="divide-y divide-slate-200 border-y border-slate-200">
                {items
                  .filter((item) => item.boxName === boxName)
                  .map((item) => (
                    <PartRow
                      key={item.id}
                      item={item}
                      canMark={canMark}
                      busy={busy}
                      editableDetails={editableDetails}
                      saveState={saveStates[item.id]}
                      detailState={saveStates[detailKey(item.id)]}
                      onSave={onSave}
                    />
                  ))}
              </ul>
            </div>
          ))}
          <div className="p-3">
            <button
              type="button"
              onClick={() => {
                onToggle();
                head.current?.focus({ preventScroll: true });
                section.current?.scrollIntoView({ block: 'start' });
              }}
              className={`${btnSecondary} w-full py-3`}
            >
              Close case {caseNo}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

/**
 * The parts of one lift, case by case, the way they stand in the yard. A lift
 * comes with its parts, so every part starts as arrived and a person only
 * touches what did not come. A case does one thing, open; a part does one
 * thing, flip between Arrived and Missing. `editableDetails` is off on the
 * register form, where there is no lift yet to save a quantity or note on.
 */
export const PartsChecklist = ({
  items,
  canMark,
  editableDetails = true,
  savingCases = new Set(),
  failedCases = new Set(),
  saveStates = {},
  onSave,
  onCase,
}: {
  items: readonly AssetChecklistItem[];
  canMark: boolean;
  editableDetails?: boolean;
  savingCases?: ReadonlySet<number>;
  failedCases?: ReadonlySet<number>;
  saveStates?: RowSaveStates;
  onSave: SaveItem;
  onCase: (caseNo: number, mark: ChecklistMark) => void;
}) => {
  const { confirm, confirmDialog } = useConfirm();
  const [openCase, setOpenCase] = useState<number | null>(null);
  const cases = summariseCases(items);
  const missing = items.filter((item) => item.mark !== 'OK');

  const tapCase = async (entry: CaseSummary) => {
    const tick = caseTick(entry);
    // One tap here would wipe every part marked missing, with no way back.
    if (
      tick === 'some' &&
      (await confirm({
        title: `All of case ${entry.caseNo} came?`,
        description: `${entry.short} missing ${entry.short === 1 ? 'part' : 'parts'} will show as arrived.`,
        confirmLabel: 'Yes, all came',
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
          if (event.target.type !== 'checkbox') {
            event.target.blur();
          }
        }
      }}
    >
      {confirmDialog}
      <div className="px-4 sm:px-0">
        <p
          className={`font-display text-2xl font-semibold ${missing.length > 0 ? 'text-red-700' : 'text-emerald-700'}`}
        >
          {partsHeadline(items.length, missing.length)}
        </p>
        {canMark ? (
          <p className="mt-1 text-sm text-slate-600">
            Everything starts as arrived. Open a case and tap any part that did
            not come.
            {editableDetails
              ? ' Each tap saves straight away.'
              : ' Quantities can be corrected after registering.'}
          </p>
        ) : null}
      </div>

      <div className="mt-3 border-y border-slate-200 bg-white sm:rounded-xl sm:border-x">
        {cases.map((entry) => (
          <CaseSection
            key={entry.caseNo}
            summary={entry}
            items={items.filter((item) => item.caseNo === entry.caseNo)}
            canMark={canMark}
            editableDetails={editableDetails}
            open={openCase === entry.caseNo}
            busy={savingCases.has(entry.caseNo)}
            failed={failedCases.has(entry.caseNo)}
            saveStates={saveStates}
            onToggle={() => {
              // A box removed while focused never saves, and iOS can keep the
              // focus in it when a button is tapped.
              if (document.activeElement instanceof HTMLInputElement) {
                document.activeElement.blur();
              }
              setOpenCase(openCase === entry.caseNo ? null : entry.caseNo);
            }}
            onSave={onSave}
            onTapCase={(summary) => void tapCase(summary)}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * The result of the check, to read or pass on. Never above the cases: each new
 * line would push the list down under a thumb.
 */
export const MissingParts = ({
  items,
}: {
  items: readonly AssetChecklistItem[];
}) => {
  const missing = items.filter((item) => item.mark !== 'OK');
  if (missing.length === 0) {
    return null;
  }
  return (
    <section aria-label="What is missing">
      <h2 className="mb-2 text-sm font-semibold text-slate-900">
        What is missing
      </h2>
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {missing.map((item) => (
          <li key={item.id} className="flex gap-3 px-4 py-2 text-sm">
            <span className="w-14 shrink-0 font-semibold text-red-700">
              Case {item.caseNo}
            </span>
            <span className="min-w-0 break-words text-slate-900">
              {item.name}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
