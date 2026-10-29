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
