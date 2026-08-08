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

  // Documented gap, not a bug: the regex checks digit shape, not calendar
  // validity, so a nonexistent day like 30 February passes. A day-of-month
  // table isn't worth it for a value an admin sets once, per task-1.3-brief.md.
  it('accepts 02-30 — the regex is calendar-naive by design', async () => {
    expect(await validateFiscalYearStart('02-30')).toHaveLength(0);
  });
});
