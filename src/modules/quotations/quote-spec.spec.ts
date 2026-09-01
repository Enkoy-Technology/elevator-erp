import {
  buildSpecSummary,
  describeFloorPlan,
  parseFloorLabels,
  paymentTermsMismatchReason,
} from './quote-spec';

describe('describeFloorPlan', () => {
  it("states the client's own B+G+M+10 lift four ways from one label list", () => {
    const plan = describeFloorPlan('B,G,M,1,2,3,4,5,6,7,8,9,10', 1);

    expect(plan).toEqual({
      labels: ['B', 'G', 'M', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
      floors: 13,
      stops: 13,
      doors: 13,
      displaySummary: 'B+G+M+10',
      floorsStopsDoors: '13/13/13',
    });
  });

  it('counts a second entrance as a second door per stop', () => {
    expect(describeFloorPlan('G,1,2,3', 2)).toMatchObject({
      stops: 4,
      doors: 8,
      floorsStopsDoors: '4/4/8',
    });
  });

  it('defaults to one entrance when none is given', () => {
    expect(describeFloorPlan('G,1,2,3')).toMatchObject({ doors: 4 });
  });

  it('tolerates the spacing a human types', () => {
    expect(parseFloorLabels(' B , G ,, 1 ')).toEqual(['B', 'G', '1']);
  });

  it('compresses an all-numbered building to its count', () => {
    expect(describeFloorPlan('1,2,3,4,5')).toMatchObject({
      displaySummary: '5',
      stops: 5,
    });
  });

  it('keeps named floors verbatim when none are numbered', () => {
    expect(describeFloorPlan('B,G')).toMatchObject({ displaySummary: 'B+G' });
  });

  it('is null for an absent or empty plan, so it never overwrites a stop count the caller supplied', () => {
    expect(describeFloorPlan(null)).toBeNull();
    expect(describeFloorPlan(undefined)).toBeNull();
    expect(describeFloorPlan('')).toBeNull();
    expect(describeFloorPlan('  ,  ')).toBeNull();
  });
});

describe('buildSpecSummary', () => {
  it("renders the client's page-1 description cell", () => {
    expect(
      buildSpecSummary({
        capacityKg: 800,
        capacityPersons: 10,
        speedMs: 1.5,
        plan: describeFloorPlan('B,G,M,1,2,3,4,5,6,7,8,9,10', 1),
      }),
    ).toBe('800KG -10persons / Speed 1.5m/s / B+G+M+10 / 13 floors/13 doors');
  });

  it('drops the segments it has nothing for (an escalator has no persons and no floor plan)', () => {
    expect(buildSpecSummary({ capacityKg: 1000, speedMs: 0.5 })).toBe(
      '1000KG / Speed 0.5m/s',
    );
  });

  it('is null when there is nothing to say', () => {
    expect(buildSpecSummary({})).toBeNull();
  });
});

describe('paymentTermsMismatchReason', () => {
  it("accepts the client's 50/30/10/10 schedule", () => {
    expect(
      paymentTermsMismatchReason([
        { percent: '50.00' },
        { percent: '30.00' },
        { percent: '10.00' },
        { percent: '10.00' },
      ]),
    ).toBeNull();
  });

  it('rejects a schedule that totals 95 — the typo nobody notices until the customer pays the smaller number', () => {
    expect(
      paymentTermsMismatchReason([
        { percent: '50.00' },
        { percent: '30.00' },
        { percent: '10.00' },
        { percent: '5.00' },
      ]),
    ).toBe(
      'Payment terms total 95.00% — a payment schedule must add up to exactly 100% of the quoted price.',
    );
  });

  it('rejects an over-100 schedule too', () => {
    expect(paymentTermsMismatchReason([{ percent: '110.00' }])).toContain(
      '110.00%',
    );
  });

  it('allows an empty schedule — that is how one gets cleared', () => {
    expect(paymentTermsMismatchReason([])).toBeNull();
  });

  it('sums in decimal, so thirds do not drift a schedule out of balance', () => {
    expect(
      paymentTermsMismatchReason([
        { percent: '33.33' },
        { percent: '33.33' },
        { percent: '33.34' },
      ]),
    ).toBeNull();
  });
});
