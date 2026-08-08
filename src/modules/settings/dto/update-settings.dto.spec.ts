import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateSettingsDto } from './update-settings.dto';

const validateFiscalYearStart = async (fiscalYearStart: string | undefined) => {
  const dto = plainToInstance(UpdateSettingsDto, { fiscalYearStart });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'fiscalYearStart');
};

describe('UpdateSettingsDto fiscalYearStart', () => {
  it('accepts the default Ethiopian fiscal year boundary', async () => {
    expect(await validateFiscalYearStart('07-08')).toHaveLength(0);
  });

  it('rejects a month outside 01-12', async () => {
    expect(await validateFiscalYearStart('13-01')).not.toHaveLength(0);
  });

  it('accepts an absent value — it is optional', async () => {
    expect(await validateFiscalYearStart(undefined)).toHaveLength(0);
  });

  it('rejects a calendar-invalid day (30 February)', async () => {
    expect(await validateFiscalYearStart('02-30')).not.toHaveLength(0);
  });

  it('rejects a calendar-invalid day (31 April)', async () => {
    expect(await validateFiscalYearStart('04-31')).not.toHaveLength(0);
  });

  // Deliberate: a leap-day fiscal year boundary is ambiguous in non-leap
  // years, so 29 February is never a valid boundary.
  it('rejects 02-29 even though it is a real day in leap years', async () => {
    expect(await validateFiscalYearStart('02-29')).not.toHaveLength(0);
  });

  it('accepts 02-28 — the last day of February in a non-leap year', async () => {
    expect(await validateFiscalYearStart('02-28')).toHaveLength(0);
  });
});
