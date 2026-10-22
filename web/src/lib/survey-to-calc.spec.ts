import {
  surveyFloorLabels,
  surveyFloors,
  surveyMachineRoom,
  surveyUnits,
} from './survey-to-calc';

describe('surveyUnits', () => {
  it.each([
    ['2', 2],
    ['3', 3],
    ['Two(2)', 2],
    ['1pc', 1],
    ['2 units', 2],
    ['  3 ', 3],
    ['999', 999],
  ])('reads %p as %d lifts', (text, units) => {
    expect(surveyUnits(text)).toBe(units);
  });

  it.each([null, '', 'two', '2-3', '2.5', '0', '1000', '2 of 630kg'])(
    'leaves %p to the person',
    (text) => {
      expect(surveyUnits(text)).toBeNull();
    },
  );
});

describe('surveyFloors', () => {
  it.each([
    ['B+G+11', 13],
    ['G+4', 5],
    ['12', 12],
    ['2B+G+10', 13],
    ['B + G + M + 5', 8],
  ])('reads %s as %d floors', (text, floors) => {
    expect(surveyFloors(text)).toBe(floors);
  });

  it.each([null, '', 'ground and four', 'G', '100'])(
    'leaves %p to the person',
    (text) => {
      expect(surveyFloors(text)).toBeNull();
    },
  );
});

describe('surveyMachineRoom', () => {
  it('reads the sheet’s two words, and nothing else', () => {
    expect(surveyMachineRoom('MRL')).toBe('MRL');
    expect(surveyMachineRoom('With MR')).toBe('MR');
    expect(surveyMachineRoom('machine room')).toBe('MR');
    expect(surveyMachineRoom('roof')).toBeNull();
    for (const negated of [
      'No MR',
      'MR-less',
      'without machine room',
      'No machine room',
      'machine room less',
    ]) {
      expect(surveyMachineRoom(negated)).toBeNull();
    }
    expect(surveyMachineRoom(null)).toBeNull();
  });
});

describe('surveyFloorLabels', () => {
  it.each([
    ['B+G+3', 'B,G,1,2,3'],
    ['2B+G+2', 'B2,B,G,1,2'],
    ['G+M+2', 'G,M,1,2'],
    ['4', 'G,1,2,3'],
  ])('names %s as %s', (text, labels) => {
    expect(surveyFloorLabels(text)).toBe(labels);
  });

  it('has one label per floor counted', () => {
    expect(surveyFloorLabels('B+G+11')!.split(',')).toHaveLength(
      surveyFloors('B+G+11')!,
    );
  });

  it('is null when the floors cannot be read', () => {
    expect(surveyFloorLabels('ground and four')).toBeNull();
  });
});
