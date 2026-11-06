import type { AssetChecklistItem, ChecklistMark } from './api';
import {
  hasSaveFailure,
  summariseCases,
  withMark,
  withoutFailures,
  withSaveState,
} from './asset-checklist';

const row = (
  id: string,
  caseNo: number,
  mark: ChecklistMark | null,
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
      row('a', 5, null),
      row('b', 1, 'OK'),
      row('c', 5, 'OK'),
    ]);

    expect(summary.map((entry) => entry.caseNo)).toEqual([1, 5]);
    expect(summary[1]).toMatchObject({ total: 2, marked: 1, short: 0 });
  });

  it('counts Missing and Damaged as short, and Not in this lift as marked only', () => {
    const [entry] = summariseCases([
      row('a', 4, 'MISSING'),
      row('b', 4, 'DAMAGED'),
      row('c', 4, 'NOT_INCLUDED'),
      row('d', 4, null),
    ]);

    expect(entry).toMatchObject({ total: 4, marked: 3, short: 2 });
  });

  it('keeps each box name in a case once, in list order', () => {
    const [entry] = summariseCases([
      row('a', 5, null, 'Mechanical parts box'),
      row('b', 5, null, 'Mechanical parts box'),
      row('c', 5, null, 'Fasteners (bolt pack)'),
    ]);

    expect(entry?.boxNames).toEqual([
      'Mechanical parts box',
      'Fasteners (bolt pack)',
    ]);
  });
});

describe('withMark', () => {
  it('changes only the one row, and can put back a blank', () => {
    const items = [row('a', 1, 'OK'), row('b', 1, 'OK')];

    const changed = withMark(items, 'b', null);

    expect(changed.map((item) => item.mark)).toEqual(['OK', null]);
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

  it('drops failures but keeps saves still on their way', () => {
    expect(withoutFailures({ a: 'failed', b: 'saving' })).toEqual({
      b: 'saving',
    });
  });

  it('finds a failed row in a case, even with the case closed', () => {
    const items = [row('a', 2, 'OK'), row('b', 2, 'OK')];

    expect(hasSaveFailure(items, { b: 'failed' })).toBe(true);
    expect(hasSaveFailure(items, { b: 'saving', z: 'failed' })).toBe(false);
  });
});
