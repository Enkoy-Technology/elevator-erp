import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateRateVersionDto } from './rates.dto';

const validateValidFrom = async (validFrom: unknown) => {
  const dto = plainToInstance(CreateRateVersionDto, {
    kind: 'VAT',
    validFrom,
    payload: { percent: '15' },
    source: 'VAT Proclamation 1341/2024',
  });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'validFrom');
};

// Regression: a shape-only regex accepted calendar-invalid dates like
// '2026-02-30', which reached RatesRepository.rotate inside a transaction
// and failed only at the final Postgres INSERT — a 500 instead of a 400 on
// an admin-facing form.
describe('CreateRateVersionDto.validFrom', () => {
  it('accepts a valid ISO date', async () => {
    expect(await validateValidFrom('2026-08-08')).toHaveLength(0);
  });

  it('rejects a calendar-invalid date (shape-valid, not a real date)', async () => {
    expect(await validateValidFrom('2026-02-30')).not.toHaveLength(0);
  });

  it('rejects a month outside 01-12', async () => {
    expect(await validateValidFrom('2026-13-01')).not.toHaveLength(0);
  });

  it('rejects a full ISO timestamp — validFrom must be date-only', async () => {
    expect(await validateValidFrom('2026-08-08T00:00:00Z')).not.toHaveLength(0);
  });

  it('rejects a non-date string', async () => {
    expect(await validateValidFrom('not-a-date')).not.toHaveLength(0);
  });
});
