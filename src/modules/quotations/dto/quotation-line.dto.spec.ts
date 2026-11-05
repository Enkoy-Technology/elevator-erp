import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateQuotationLineDto } from './quotation-line.dto';

// The typed load and persons are cleared with null, not by leaving them out:
// a line update merges onto what is stored, so an absent key keeps them.
describe('UpdateQuotationLineDto typed load and persons', () => {
  const errorsOn = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateQuotationLineDto, body))).map(
      (e) => e.property,
    );

  it('accepts null, which goes back to the derived figure', async () => {
    expect(
      await errorsOn({ capacityKgOverride: null, capacityPersonsOverride: null }),
    ).toEqual([]);
  });

  it('accepts a load and a head count in range', async () => {
    expect(
      await errorsOn({ capacityKgOverride: 800, capacityPersonsOverride: 10 }),
    ).toEqual([]);
  });

  it('refuses a load or a head count out of range, or not whole', async () => {
    expect(
      await errorsOn({ capacityKgOverride: 0, capacityPersonsOverride: 0 }),
    ).toEqual(['capacityKgOverride', 'capacityPersonsOverride']);
    expect(
      await errorsOn({
        capacityKgOverride: 5001,
        capacityPersonsOverride: 10.5,
      }),
    ).toEqual(['capacityKgOverride', 'capacityPersonsOverride']);
  });
});

describe('UpdateQuotationLineDto typed travel', () => {
  const errors = async (travelHeightMOverride: unknown) =>
    (
      await validate(
        plainToInstance(UpdateQuotationLineDto, { travelHeightMOverride }),
      )
    ).flatMap((e) => Object.values(e.constraints ?? {}));

  it('accepts null, which goes back to 3.5 m a floor, and a figure in range', async () => {
    expect(await errors(null)).toEqual([]);
    expect(await errors(3)).toEqual([]);
    expect(await errors(42.25)).toEqual([]);
    expect(await errors(200)).toEqual([]);
  });

  it('refuses a figure out of range, in words a salesperson can read', async () => {
    // 42000 is what someone reading the specification in mm would type.
    for (const typed of [2, 201, 42000, 42.123]) {
      expect((await errors(typed))[0]).toBe(
        'Travel height is from 3 to 200 m, to two decimals.',
      );
    }
  });
});

describe('UpdateQuotationLineDto typed speed and car', () => {
  const errors = async (body: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateQuotationLineDto, body))).flatMap(
      (e) => Object.values(e.constraints ?? {}),
    );

  it('accepts null, which goes back to the table, and a figure in range', async () => {
    expect(
      await errors({
        speedMsOverride: null,
        carWidthMmOverride: null,
        carDepthMmOverride: null,
        carHeightMmOverride: null,
      }),
    ).toEqual([]);
    expect(
      await errors({
        speedMsOverride: 1.75,
        carWidthMmOverride: 1350,
        carDepthMmOverride: 1400,
        carHeightMmOverride: 2400,
      }),
    ).toEqual([]);
  });

  it('refuses a figure out of range, in words a salesperson can read', async () => {
    for (const speedMsOverride of [0.01, 11, 1.755]) {
      expect((await errors({ speedMsOverride }))[0]).toBe(
        'Speed is from 0.05 to 10 m/s, to two decimals.',
      );
    }
    for (const key of [
      'carWidthMmOverride',
      'carDepthMmOverride',
      'carHeightMmOverride',
    ]) {
      for (const typed of [499, 10001, 1350.5]) {
        expect((await errors({ [key]: typed }))[0]).toBe(
          'Car size is a whole number from 500 to 10,000 mm.',
        );
      }
    }
  });
});
