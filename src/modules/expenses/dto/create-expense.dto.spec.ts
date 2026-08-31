import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateExpenseDto } from './create-expense.dto';

const BANK_ACCOUNT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const base = {
  supplierName: 'Acme Supplies',
  supplierLicenceOnFile: true,
  supplyKind: 'GOODS',
  category: 'MATERIALS',
  expenseDate: '2026-08-08',
};

const errorsFor = async (dto: Record<string, unknown>) => {
  const instance = plainToInstance(CreateExpenseDto, dto);
  return validate(instance);
};

const propertyErrors = (errors: Awaited<ReturnType<typeof errorsFor>>, property: string) =>
  errors.filter((e) => e.property === property);

describe('CreateExpenseDto — bankAccountId required per paidVia (same rule as payments, brief 4.1)', () => {
  it('CASH may omit bankAccountId', async () => {
    const errors = await errorsFor({ ...base, paidVia: 'CASH', vatIncluded: false, netAmountEtb: '100.00' });
    expect(propertyErrors(errors, 'bankAccountId')).toHaveLength(0);
  });

  it('OTHER may omit bankAccountId', async () => {
    const errors = await errorsFor({ ...base, paidVia: 'OTHER', vatIncluded: false, netAmountEtb: '100.00' });
    expect(propertyErrors(errors, 'bankAccountId')).toHaveLength(0);
  });

  it.each(['BANK_TRANSFER', 'CHEQUE', 'CBE_BIRR', 'TELEBIRR'])(
    '%s without bankAccountId fails validation',
    async (paidVia) => {
      const errors = await errorsFor({
        ...base,
        paidVia,
        vatIncluded: false,
        netAmountEtb: '100.00',
      });
      expect(propertyErrors(errors, 'bankAccountId')).not.toHaveLength(0);
    },
  );

  it.each(['BANK_TRANSFER', 'CHEQUE', 'CBE_BIRR', 'TELEBIRR'])(
    '%s with a valid bankAccountId passes',
    async (paidVia) => {
      const errors = await errorsFor({
        ...base,
        paidVia,
        bankAccountId: BANK_ACCOUNT_ID,
        vatIncluded: false,
        netAmountEtb: '100.00',
      });
      expect(propertyErrors(errors, 'bankAccountId')).toHaveLength(0);
    },
  );
});

describe('CreateExpenseDto — exactly one of {netAmountEtb, vatIncluded:false} or {grossAmountEtb, vatIncluded:true} (brief 4.1)', () => {
  it('vatIncluded=false with netAmountEtb only: valid', async () => {
    const errors = await errorsFor({ ...base, paidVia: 'CASH', vatIncluded: false, netAmountEtb: '100.00' });
    expect(propertyErrors(errors, 'netAmountEtb')).toHaveLength(0);
    expect(propertyErrors(errors, 'grossAmountEtb')).toHaveLength(0);
  });

  it('vatIncluded=true with grossAmountEtb only: valid', async () => {
    const errors = await errorsFor({
      ...base,
      paidVia: 'CASH',
      vatIncluded: true,
      grossAmountEtb: '115.00',
    });
    expect(propertyErrors(errors, 'netAmountEtb')).toHaveLength(0);
    expect(propertyErrors(errors, 'grossAmountEtb')).toHaveLength(0);
  });

  it('neither netAmountEtb nor grossAmountEtb provided: rejected', async () => {
    const errors = await errorsFor({ ...base, paidVia: 'CASH', vatIncluded: false });
    expect(propertyErrors(errors, 'netAmountEtb').length).toBeGreaterThan(0);
  });

  it('both netAmountEtb and grossAmountEtb provided: rejected', async () => {
    const errors = await errorsFor({
      ...base,
      paidVia: 'CASH',
      vatIncluded: true,
      netAmountEtb: '100.00',
      grossAmountEtb: '115.00',
    });
    expect(propertyErrors(errors, 'netAmountEtb').length).toBeGreaterThan(0);
  });

  it('vatIncluded=false but grossAmountEtb supplied instead of netAmountEtb: rejected', async () => {
    const errors = await errorsFor({
      ...base,
      paidVia: 'CASH',
      vatIncluded: false,
      grossAmountEtb: '115.00',
    });
    expect(propertyErrors(errors, 'netAmountEtb').length).toBeGreaterThan(0);
    expect(propertyErrors(errors, 'grossAmountEtb').length).toBeGreaterThan(0);
  });
});

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);

describe('CreateExpenseDto.expenseDate — fix-wave-c #2: rejects a far-future date (a year typo must not silently mis-resolve VAT/WHT rates)', () => {
  const withExpenseDate = { paidVia: 'CASH', vatIncluded: false, netAmountEtb: '100.00' } as const;

  it('accepts today', async () => {
    const errors = await errorsFor({ ...base, ...withExpenseDate, expenseDate: dateOnly(new Date()) });
    expect(propertyErrors(errors, 'expenseDate')).toHaveLength(0);
  });

  it('accepts tomorrow', async () => {
    const tomorrow = dateOnly(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const errors = await errorsFor({ ...base, ...withExpenseDate, expenseDate: tomorrow });
    expect(propertyErrors(errors, 'expenseDate')).toHaveLength(0);
  });

  it('rejects next year', async () => {
    const nextYear = dateOnly(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000));
    const errors = await errorsFor({ ...base, ...withExpenseDate, expenseDate: nextYear });
    expect(propertyErrors(errors, 'expenseDate').length).toBeGreaterThan(0);
  });
});
