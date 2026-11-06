import type { AssetChecklistItem, ChecklistMark } from './api';

export interface CaseSummary {
  caseNo: number;
  boxNames: string[];
  total: number;
  /** Rows the store keeper has looked at, whatever the mark. */
  marked: number;
  /** Rows marked Missing or Damaged. */
  short: number;
}

const isShort = (mark: ChecklistMark | null): boolean =>
  mark === 'MISSING' || mark === 'DAMAGED';

export const summariseCases = (
  items: readonly AssetChecklistItem[],
): CaseSummary[] => {
  const cases = new Map<number, CaseSummary>();
  for (const item of items) {
    const entry = cases.get(item.caseNo) ?? {
      caseNo: item.caseNo,
      boxNames: [],
      total: 0,
      marked: 0,
      short: 0,
    };
    if (!entry.boxNames.includes(item.boxName)) {
      entry.boxNames.push(item.boxName);
    }
    entry.total += 1;
    entry.marked += item.mark ? 1 : 0;
    entry.short += isShort(item.mark) ? 1 : 0;
    cases.set(item.caseNo, entry);
  }
  return [...cases.values()].sort((a, b) => a.caseNo - b.caseNo);
};

/** A new list with one row's mark changed, to show or undo a mark at once. */
export const withMark = (
  items: readonly AssetChecklistItem[],
  itemId: string,
  mark: ChecklistMark | null,
): AssetChecklistItem[] =>
  items.map((item) => (item.id === itemId ? { ...item, mark } : item));

export type RowSaveState = 'saving' | 'failed';
export type RowSaveStates = Readonly<Record<string, RowSaveState>>;

export const withSaveState = (
  states: RowSaveStates,
  itemId: string,
  state: RowSaveState | null,
): RowSaveStates => {
  const { [itemId]: _replaced, ...others } = states;
  return state ? { ...others, [itemId]: state } : others;
};

export const withoutFailures = (states: RowSaveStates): RowSaveStates =>
  Object.fromEntries(
    Object.entries(states).filter(([, state]) => state === 'saving'),
  );

export const hasSaveFailure = (
  items: readonly AssetChecklistItem[],
  states: RowSaveStates,
): boolean => items.some((item) => states[item.id] === 'failed');
