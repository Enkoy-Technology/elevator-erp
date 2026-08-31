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

const validateMaintenanceReminderDays = async (maintenanceReminderDays: unknown) => {
  const dto = plainToInstance(UpdateSettingsDto, { maintenanceReminderDays });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'maintenanceReminderDays');
};

describe('UpdateSettingsDto maintenanceReminderDays', () => {
  it('accepts the default 3-day window', async () => {
    expect(await validateMaintenanceReminderDays(3)).toHaveLength(0);
  });

  it('accepts 0 — same-day-only reminders', async () => {
    expect(await validateMaintenanceReminderDays(0)).toHaveLength(0);
  });

  it('rejects a negative window', async () => {
    expect(await validateMaintenanceReminderDays(-1)).not.toHaveLength(0);
  });

  it('rejects a non-integer', async () => {
    expect(await validateMaintenanceReminderDays(2.5)).not.toHaveLength(0);
  });

  it('rejects an unreasonably large window', async () => {
    expect(await validateMaintenanceReminderDays(91)).not.toHaveLength(0);
  });

  it('accepts an absent value — it is optional', async () => {
    expect(await validateMaintenanceReminderDays(undefined)).toHaveLength(0);
  });
});

const validatePaymentReminderOffsetDays = async (paymentReminderOffsetDays: unknown) => {
  const dto = plainToInstance(UpdateSettingsDto, { paymentReminderOffsetDays });
  const errors = await validate(dto);
  return errors.filter((e) => e.property === 'paymentReminderOffsetDays');
};

describe('UpdateSettingsDto paymentReminderOffsetDays', () => {
  it('accepts the default [0, 7, 30] offset set', async () => {
    expect(await validatePaymentReminderOffsetDays([0, 7, 30])).toHaveLength(0);
  });

  it('rejects an empty array — at least one offset is required', async () => {
    expect(await validatePaymentReminderOffsetDays([])).not.toHaveLength(0);
  });

  it('rejects a negative offset', async () => {
    expect(await validatePaymentReminderOffsetDays([0, -7])).not.toHaveLength(0);
  });

  it('rejects a non-integer offset', async () => {
    expect(await validatePaymentReminderOffsetDays([0, 7.5])).not.toHaveLength(0);
  });

  it('rejects a non-array value', async () => {
    expect(await validatePaymentReminderOffsetDays(7)).not.toHaveLength(0);
  });

  it('accepts an absent value — it is optional', async () => {
    expect(await validatePaymentReminderOffsetDays(undefined)).toHaveLength(0);
  });
});
