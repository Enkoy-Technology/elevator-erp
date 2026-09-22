import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateQuotationTermsDto } from './quotation-terms.dto';

const errorsFor = async (body: Record<string, unknown>): Promise<string[]> => {
  const errors = await validate(plainToInstance(UpdateQuotationTermsDto, body));
  return errors.map((error) => error.property);
};

describe('UpdateQuotationTermsDto', () => {
  it('takes two names and a model in the reference code', async () => {
    // Their own document: "KALKIDAN AND MIKA FUJI-E22".
    await expect(
      errorsFor({ referenceCode: 'KALKIDAN AND MIKA FUJI-E22' }),
    ).resolves.toEqual([]);
  });

  it('accepts a reference code of 80 characters and rejects 81', async () => {
    await expect(errorsFor({ referenceCode: 'x'.repeat(80) })).resolves.toEqual(
      [],
    );
    await expect(errorsFor({ referenceCode: 'x'.repeat(81) })).resolves.toEqual(
      ['referenceCode'],
    );
  });

  it('takes the salespeople the quotation asks for, and null to clear them', async () => {
    await expect(
      errorsFor({ salesName: 'KALKIDAN AND MIKA' }),
    ).resolves.toEqual([]);
    await expect(errorsFor({ salesName: null })).resolves.toEqual([]);
  });

  it('accepts a sales name of 120 characters and rejects 121', async () => {
    await expect(errorsFor({ salesName: 'x'.repeat(120) })).resolves.toEqual(
      [],
    );
    await expect(errorsFor({ salesName: 'x'.repeat(121) })).resolves.toEqual([
      'salesName',
    ]);
  });

  it('takes the per-offer special notes that print on page 1', async () => {
    await expect(
      errorsFor({
        notes:
          'Access Card\nMusic In The Cabin (Based On Client Preference)\nLED Display in the lobby for advertisement',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects notes longer than 2000 characters', async () => {
    await expect(errorsFor({ notes: 'x'.repeat(2001) })).resolves.toEqual([
      'notes',
    ]);
  });

  it('is entirely optional — an empty patch is valid', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
  });
});
