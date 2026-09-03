import {
  composeFloorLabels,
  decomposeFloorLabels,
  describeFloorPlan,
  toggleUpperFloor,
} from './floor-plan';

describe('toggleUpperFloor', () => {
  it('selects every floor below the one clicked', () => {
    // A lift that stops at the 10th stops at the 9th. One click, not ten.
    expect(toggleUpperFloor([], 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('removes only the floor clicked, so a building can skip one', () => {
    // "No 13th floor" — the case a plain number input cannot express.
    const upToFourteen = toggleUpperFloor([], 14);
    expect(toggleUpperFloor(upToFourteen, 13)).not.toContain(13);
    expect(toggleUpperFloor(upToFourteen, 13)).toContain(14);
  });

  it('keeps a deliberate gap above the floor clicked', () => {
    // Someone removed 13, then clicked 5. Filling 1-5 must not resurrect 13.
    const withGap = [1, 2, 3, 4, 5, 6, 14];
    expect(toggleUpperFloor(withGap, 5)).not.toContain(13);
    expect(toggleUpperFloor(withGap, 5)).toContain(14);
  });

  it('stays sorted whatever order the clicks came in', () => {
    expect(toggleUpperFloor([5, 1, 3], 2)).toEqual([1, 2, 3, 5]);
  });
});

describe('composeFloorLabels', () => {
  it('orders bottom to top, whatever order they were picked', () => {
    expect(composeFloorLabels(['M', 'G', 'B'], [2, 1, 3])).toBe(
      'B,G,M,1,2,3',
    );
  });

  it('reproduces the client’s own building', () => {
    // Their quotation: B+G+M+10, 13 landings.
    const labels = composeFloorLabels(
      ['B', 'G', 'M'],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    );
    expect(labels).toBe('B,G,M,1,2,3,4,5,6,7,8,9,10');
    const plan = describeFloorPlan(labels, 1);
    expect(plan?.stops).toBe(13);
    expect(plan?.displaySummary).toBe('B+G+M+10');
    expect(plan?.floorsStopsDoors).toBe('13/13/13');
  });

  it('is empty when nothing is picked', () => {
    expect(composeFloorLabels([], [])).toBe('');
  });
});

describe('decomposeFloorLabels', () => {
  it('round-trips what compose produced', () => {
    const labels = composeFloorLabels(['B', 'G', 'M'], [1, 2, 3]);
    const back = decomposeFloorLabels(labels);
    expect(back.specials).toEqual(['B', 'G', 'M']);
    expect(back.upper).toEqual([1, 2, 3]);
    expect(back.custom).toEqual([]);
  });

  it('reports labels the chips cannot express instead of dropping them', () => {
    // A saved line with "LG" must not come back as a picker that silently
    // loses it — the caller falls back to the text field.
    const back = decomposeFloorLabels('B,LG,G,1,2');
    expect(back.custom).toEqual(['LG']);
    expect(back.specials).toEqual(['B', 'G']);
    expect(back.upper).toEqual([1, 2]);
  });

  it('treats a floor above the chip range as custom', () => {
    expect(decomposeFloorLabels('G,45').custom).toEqual(['45']);
  });

  it('handles an empty or missing value', () => {
    expect(decomposeFloorLabels('')).toEqual({
      specials: [],
      upper: [],
      custom: [],
    });
    expect(decomposeFloorLabels(null)).toEqual({
      specials: [],
      upper: [],
      custom: [],
    });
  });
});
