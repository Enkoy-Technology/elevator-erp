import type { AssetChecklistItem, ChecklistMark, PackingListRow } from './api';

export interface CaseSummary {
  caseNo: number;
  boxNames: string[];
  total: number;
  /** Rows ticked as arrived. */
  arrived: number;
  /** Rows unticked as not arrived. */
  short: number;
}

export const summariseCases = (
  items: readonly AssetChecklistItem[],
): CaseSummary[] => {
  const cases = new Map<number, CaseSummary>();
  for (const item of items) {
    const entry = cases.get(item.caseNo) ?? {
      caseNo: item.caseNo,
      boxNames: [],
      total: 0,
      arrived: 0,
      short: 0,
    };
    if (!entry.boxNames.includes(item.boxName)) {
      entry.boxNames.push(item.boxName);
    }
    entry.total += 1;
    entry.arrived += item.mark === 'OK' ? 1 : 0;
    entry.short += item.mark === 'MISSING' ? 1 : 0;
    cases.set(item.caseNo, entry);
  }
  return [...cases.values()].sort((a, b) => a.caseNo - b.caseNo);
};

/** A new list with one row's mark changed, to show or undo a mark at once. */
export const withMark = (
  items: readonly AssetChecklistItem[],
  itemId: string,
  mark: ChecklistMark,
): AssetChecklistItem[] =>
  items.map((item) => (item.id === itemId ? { ...item, mark } : item));

/** Puts the given rows back as they were, leaving every other row alone. */
export const restoreRows = (
  items: readonly AssetChecklistItem[],
  before: readonly AssetChecklistItem[],
): AssetChecklistItem[] => {
  const earlier = new Map(before.map((item) => [item.id, item]));
  return items.map((item) => earlier.get(item.id) ?? item);
};

export type RowSaveState = 'saving' | 'failed';
export type RowSaveStates = Readonly<Record<string, RowSaveState>>;

/**
 * Where a row's quantity or note keeps its state. Apart from its tap, because
 * they retry differently and one saving must not hide that the other failed.
 */
export const detailKey = (itemId: string): string => `${itemId}:details`;

export const withSaveState = (
  states: RowSaveStates,
  itemId: string,
  state: RowSaveState | null,
): RowSaveStates => {
  const { [itemId]: _replaced, ...others } = states;
  return state ? { ...others, [itemId]: state } : others;
};

export const withoutFailures = (
  states: RowSaveStates,
  itemIds: readonly string[],
): RowSaveStates =>
  Object.fromEntries(
    Object.entries(states).filter(
      ([id, state]) => state === 'saving' || !itemIds.includes(id),
    ),
  );

export const hasRowSaving = (
  items: readonly AssetChecklistItem[],
  states: RowSaveStates,
): boolean =>
  items.some(
    (item) =>
      states[item.id] === 'saving' || states[detailKey(item.id)] === 'saving',
  );

export const hasSaveFailure = (
  items: readonly AssetChecklistItem[],
  states: RowSaveStates,
): boolean =>
  items.some(
    (item) =>
      states[item.id] === 'failed' || states[detailKey(item.id)] === 'failed',
  );

/** Failed taps the server holds anyway: the save landed and only its reply was lost. */
export const landedRows = (
  items: readonly AssetChecklistItem[],
  wanted: ReadonlyMap<string, ChecklistMark>,
): string[] =>
  items
    .filter((item) => wanted.get(item.id) === item.mark)
    .map((item) => item.id);

export const landedCases = (
  items: readonly AssetChecklistItem[],
  wanted: ReadonlyMap<number, ChecklistMark>,
): number[] =>
  [...wanted]
    .filter(([caseNo, mark]) => {
      const rows = items.filter((item) => item.caseNo === caseNo);
      return rows.length > 0 && rows.every((item) => item.mark === mark);
    })
    .map(([caseNo]) => caseNo);

/** The box at the head of a case: ticked, half ticked, or empty. */
export const caseTick = ({
  arrived,
  total,
}: CaseSummary): 'all' | 'some' | 'none' =>
  arrived === total ? 'all' : arrived === 0 ? 'none' : 'some';

export const withCaseMark = (
  items: readonly AssetChecklistItem[],
  caseNo: number,
  mark: ChecklistMark,
): AssetChecklistItem[] =>
  items.map((item) => (item.caseNo === caseNo ? { ...item, mark } : item));

/** What a case holds, in the same two words a part uses. */
export const caseStateText = ({ total, arrived, short }: CaseSummary): string => {
  if (short === 0) {
    return total === 1 ? 'Arrived' : `All ${total} arrived`;
  }
  if (arrived === 0) {
    return total === 1 ? 'Missing' : `All ${total} missing`;
  }
  return `${short} of ${total} missing`;
};

export const partsHeadline = (total: number, missing: number): string =>
  missing === 0
    ? `All ${total} parts arrived`
    : `${missing} ${missing === 1 ? 'part' : 'parts'} missing`;

export const withCaseNo = (
  cases: ReadonlySet<number>,
  caseNo: number,
): ReadonlySet<number> => new Set(cases).add(caseNo);

export const withoutCaseNo = (
  cases: ReadonlySet<number>,
  caseNo: number,
): ReadonlySet<number> => {
  const next = new Set(cases);
  next.delete(caseNo);
  return next;
};

/** The register form's list, before there is a lift to save it on. */
export const packingListItems = (
  rows: readonly PackingListRow[],
): AssetChecklistItem[] =>
  rows.map((row) => ({
    ...row,
    id: `${row.caseNo}/${row.itemNo}`,
    mark: 'OK',
    note: null,
  }));

export const partsNotArrived = (
  items: readonly AssetChecklistItem[],
): string[] =>
  items.filter((item) => item.mark !== 'OK').map((item) => item.id);
