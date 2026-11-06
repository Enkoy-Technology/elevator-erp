import type { AssetChecklistItem, ChecklistMark } from './api';
import {
  caseStateText,
  caseTick,
  detailKey,
  hasRowSaving,
  hasSaveFailure,
  landedCases,
  landedRows,
  packingListItems,
  partsHeadline,
  partsNotArrived,
  restoreRows,
  summariseCases,
  withCaseMark,
  withCaseNo,
  withMark,
  withoutCaseNo,
  withoutFailures,
  withSaveState,
} from './asset-checklist';

const row = (
  id: string,
  caseNo: number,
  mark: ChecklistMark,
  boxName = `Box ${caseNo}`,
): AssetChecklistItem => ({
  id,
  caseNo,
  boxName,
  itemNo: id,
  name: `Part ${id}`,
  factoryName: `Part ${id}`,
  specification: null,
  unit: 'Piece',
  quantity: '1',
  mark,
  note: null,
});

describe('summariseCases', () => {
  it('gives one entry per case, in case order', () => {
    const summary = summariseCases([
      row('a', 5, 'MISSING'),
      row('b', 1, 'OK'),
      row('c', 5, 'OK'),
    ]);

    expect(summary.map((entry) => entry.caseNo)).toEqual([1, 5]);
    expect(summary[1]).toMatchObject({ total: 2, arrived: 1, short: 1 });
  });

  it('counts a tick as arrived and an untick as short', () => {
    const [entry] = summariseCases([
      row('a', 4, 'MISSING'),
      row('b', 4, 'OK'),
      row('c', 4, 'OK'),
    ]);

    expect(entry).toMatchObject({ total: 3, arrived: 2, short: 1 });
  });

  it('keeps each box name in a case once, in list order', () => {
    const [entry] = summariseCases([
      row('a', 5, 'OK', 'Mechanical parts box'),
      row('b', 5, 'OK', 'Mechanical parts box'),
      row('c', 5, 'OK', 'Fasteners (bolt pack)'),
    ]);

    expect(entry?.boxNames).toEqual([
      'Mechanical parts box',
      'Fasteners (bolt pack)',
    ]);
  });
});

describe('withMark', () => {
  it('changes only the one row', () => {
    const items = [row('a', 1, 'OK'), row('b', 1, 'OK')];

    const changed = withMark(items, 'b', 'MISSING');

    expect(changed.map((item) => item.mark)).toEqual(['OK', 'MISSING']);
    expect(items[1]?.mark).toBe('OK');
    expect(changed[0]).toBe(items[0]);
  });
});

describe('row save states', () => {
  it('sets, replaces and clears one row without touching the others', () => {
    const saving = withSaveState({ a: 'saving' }, 'b', 'saving');
    expect(saving).toEqual({ a: 'saving', b: 'saving' });

    expect(withSaveState(saving, 'b', 'failed')).toEqual({
      a: 'saving',
      b: 'failed',
    });
    expect(withSaveState(saving, 'b', null)).toEqual({ a: 'saving' });
  });

  it('drops the failures of the named rows only', () => {
    expect(
      withoutFailures({ a: 'failed', b: 'saving', c: 'failed' }, ['a', 'b']),
    ).toEqual({ b: 'saving', c: 'failed' });
  });

  it('finds a row still saving', () => {
    const items = [row('a', 2, 'OK')];

    expect(hasRowSaving(items, { a: 'saving' })).toBe(true);
    expect(hasRowSaving(items, { a: 'failed', z: 'saving' })).toBe(false);
  });

  it('finds a failed row in a case, even with the case closed', () => {
    const items = [row('a', 2, 'OK'), row('b', 2, 'OK')];

    expect(hasSaveFailure(items, { b: 'failed' })).toBe(true);
    expect(hasSaveFailure(items, { b: 'saving', z: 'failed' })).toBe(false);
  });
});

describe('withCaseMark', () => {
  it('changes every row of the one case', () => {
    const changed = withCaseMark(
      [row('a', 1, 'OK'), row('b', 2, 'OK'), row('c', 2, 'OK')],
      2,
      'MISSING',
    );

    expect(changed.map((item) => item.mark)).toEqual([
      'OK',
      'MISSING',
      'MISSING',
    ]);
  });
});

describe('restoreRows', () => {
  it('puts back only the rows given, and leaves a newer tick elsewhere', () => {
    const before = [row('a', 5, 'OK')];
    const current = [row('a', 5, 'MISSING'), row('b', 2, 'MISSING')];

    expect(restoreRows(current, before).map((item) => item.mark)).toEqual([
      'OK',
      'MISSING',
    ]);
  });
});

describe('caseTick', () => {
  const summary = (arrived: number) => ({
    caseNo: 1,
    boxNames: [],
    total: 3,
    arrived,
    short: 0,
  });

  it('is all, some or none, for the box at the head of a case', () => {
    expect(caseTick(summary(3))).toBe('all');
    expect(caseTick(summary(1))).toBe('some');
    expect(caseTick(summary(0))).toBe('none');
  });
});

describe('the packing list on the register form', () => {
  const rows = [
    {
      caseNo: 1,
      boxName: 'Elevator wall',
      itemNo: '2',
      name: 'Landing door',
      factoryName: 'Floor door',
      specification: '700',
      unit: 'Piece',
      quantity: '7',
    },
    {
      caseNo: 5,
      boxName: 'Fasteners (bolt pack)',
      itemNo: 'F3',
      name: 'Guide shoe fixing',
      factoryName: '导靴固定',
      specification: null,
      unit: null,
      quantity: '8',
    },
  ];

  it('starts with every part ticked as arrived', () => {
    const items = packingListItems(rows);

    expect(items.map((item) => item.mark)).toEqual(['OK', 'OK']);
    expect(items.map((item) => item.id)).toEqual(['1/2', '5/F3']);
  });

  it('sends only the parts that were unticked', () => {
    const items = withMark(packingListItems(rows), '5/F3', 'MISSING');

    expect(partsNotArrived(items)).toEqual(['5/F3']);
  });
});

describe('caseStateText', () => {
  const summary = (total: number, short: number) => ({
    caseNo: 4,
    boxNames: ['Electrical parts'],
    total,
    arrived: total - short,
    short,
  });

  it('says a whole case arrived, in the words a row uses', () => {
    expect(caseStateText(summary(48, 0))).toBe('All 48 arrived');
  });

  it('says how many of a case are missing', () => {
    expect(caseStateText(summary(48, 2))).toBe('2 of 48 missing');
  });

  it('says when a whole case is missing', () => {
    expect(caseStateText(summary(48, 48))).toBe('All 48 missing');
  });

  it('does not say "all 1" for a case holding one part', () => {
    expect(caseStateText(summary(1, 0))).toBe('Arrived');
    expect(caseStateText(summary(1, 1))).toBe('Missing');
  });
});

describe('partsHeadline', () => {
  it('leads with the good news when nothing is missing', () => {
    expect(partsHeadline(134, 0)).toBe('All 134 parts arrived');
  });

  it('counts what is missing', () => {
    expect(partsHeadline(134, 1)).toBe('1 part missing');
    expect(partsHeadline(134, 2)).toBe('2 parts missing');
  });
});

describe('withCaseNo and withoutCaseNo', () => {
  it('adds and removes a case without touching the set it was given', () => {
    const before: ReadonlySet<number> = new Set([1]);

    const added = withCaseNo(before, 2);
    const removed = withoutCaseNo(added, 1);

    expect([...added]).toEqual([1, 2]);
    expect([...removed]).toEqual([2]);
    expect([...before]).toEqual([1]);
  });
});

describe('a quantity or note saved beside a tap', () => {
  const items = [row('a', 1, 'OK')];

  it('counts as a failure of its row', () => {
    expect(hasSaveFailure(items, { [detailKey('a')]: 'failed' })).toBe(true);
  });

  it('counts as its row saving', () => {
    expect(hasRowSaving(items, { [detailKey('a')]: 'saving' })).toBe(true);
  });

  it('keeps its own state when the tap on the same row changes', () => {
    const failedTap = withSaveState({}, 'a', 'failed');
    const both = withSaveState(failedTap, detailKey('a'), 'saving');

    expect(withSaveState(both, detailKey('a'), null)).toEqual({ a: 'failed' });
    expect(withSaveState(both, 'a', null)).toEqual({
      [detailKey('a')]: 'saving',
    });
  });

  it('survives a case save, which settles taps and not typed details', () => {
    const states = {
      a: 'failed',
      [detailKey('a')]: 'failed',
    } as const;

    expect(withoutFailures(states, ['a'])).toEqual({
      [detailKey('a')]: 'failed',
    });
  });
});

describe('landedRows', () => {
  it('finds a failed tap the server holds anyway, so only its reply was lost', () => {
    const items = [row('a', 1, 'MISSING'), row('b', 1, 'OK')];
    const wanted = new Map<string, ChecklistMark>([
      ['a', 'MISSING'],
      ['b', 'MISSING'],
    ]);

    expect(landedRows(items, wanted)).toEqual(['a']);
  });
});

describe('landedCases', () => {
  it('finds a failed case only when every part of it holds the mark', () => {
    const items = [
      row('a', 1, 'MISSING'),
      row('b', 1, 'MISSING'),
      row('c', 2, 'MISSING'),
      row('d', 2, 'OK'),
    ];
    const wanted = new Map<number, ChecklistMark>([
      [1, 'MISSING'],
      [2, 'MISSING'],
    ]);

    expect(landedCases(items, wanted)).toEqual([1]);
  });

  it('does not count a case with no rows as landed', () => {
    const wanted = new Map<number, ChecklistMark>([[9, 'OK']]);

    expect(landedCases([row('a', 1, 'OK')], wanted)).toEqual([]);
  });
});
