import { ARRIVAL_CHECKLIST, withArrivedMarks } from './arrival-checklist';

const inCase = (caseNo: number) =>
  ARRIVAL_CHECKLIST.filter((row) => row.caseNo === caseNo);

describe('ARRIVAL_CHECKLIST', () => {
  it('holds the 134 rows of packing list 2025-J048, across its 16 cases', () => {
    expect(ARRIVAL_CHECKLIST).toHaveLength(134);
    expect(new Set(ARRIVAL_CHECKLIST.map((row) => row.caseNo)).size).toBe(16);
    expect(inCase(4)).toHaveLength(48);
    expect(inCase(5)).toHaveLength(54);
  });

  it('has no row twice', () => {
    const keys = ARRIVAL_CHECKLIST.map((row) => `${row.caseNo}/${row.itemNo}`);
    expect(new Set(keys).size).toBe(134);
  });

  it('leaves out the rows that only repeat another row with no quantity', () => {
    const itemNos = inCase(4).map((row) => row.itemNo);
    expect(itemNos).not.toEqual(
      expect.arrayContaining(['2', '3', '4', '43']),
    );
    expect(itemNos).toEqual(expect.arrayContaining(['50', '51', '52', '53']));
    expect(inCase(1).map((row) => row.itemNo)).not.toContain('11');
  });

  it('gives every row a name a store keeper can read', () => {
    for (const row of ARRIVAL_CHECKLIST) {
      expect(row.name.trim()).not.toBe('');
      expect(row.factoryName.trim()).not.toBe('');
    }
  });

  it('keeps the factory wording of a quantity and blanks the dashes', () => {
    const row = (caseNo: number, itemNo: string) =>
      inCase(caseNo).find((candidate) => candidate.itemNo === itemNo);
    expect(row(12, '1')?.quantity).toBe('4M=12, 2.5M=2');
    expect(row(1, '5')?.quantity).toBeNull();
    expect(row(5, '17')?.quantity).toBe('0');
  });

  describe('withArrivedMarks', () => {
    it('ticks every part as arrived when nothing is named', () => {
      const rows = withArrivedMarks();

      expect(rows).toHaveLength(134);
      expect(rows.every((row) => row.mark === 'OK')).toBe(true);
    });

    it('ignores a key that is not on the list', () => {
      const rows = withArrivedMarks(['99/1']);

      expect(rows.every((row) => row.mark === 'OK')).toBe(true);
    });
  });
});
