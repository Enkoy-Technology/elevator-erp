import type { AuthenticatedUser } from '../../types/auth.types';
import type { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpensesService } from './expenses.service';

const USER: AuthenticatedUser = {
  userId: '11111111-1111-1111-1111-111111111111',
  tenantId: '22222222-2222-2222-2222-222222222222',
  role: 'FINANCE',
};

const RATE_VERSIONS: Record<string, { id: string; payload: Record<string, unknown> }> = {
  VAT: { id: 'vat-v1', payload: { percent: '15' } },
  WHT_NO_TIN: { id: 'wht-no-tin-v1', payload: { percent: '30' } },
  WHT_GOODS: { id: 'wht-goods-v1', payload: { percent: '3', thresholdEtb: '20000' } },
  WHT_SERVICES: { id: 'wht-services-v1', payload: { percent: '3', thresholdEtb: '10000' } },
};

/** Records every (kind, onDate) RatesService.resolve was called with, so tests can assert expense-date (not today) resolution. */
function makeRatesService(): { resolve: jest.Mock; calls: { kind: string; onDate: string }[] } {
  const calls: { kind: string; onDate: string }[] = [];
  const resolve = jest.fn((kind: string, onDate: string) => {
    calls.push({ kind, onDate });
    const version = RATE_VERSIONS[kind];
    if (!version) {
      throw new Error(`no stubbed rate version for kind ${kind}`);
    }
    return Promise.resolve({
      id: version.id,
      kind,
      validFrom: '2019-01-01',
      validTo: null,
      payload: version.payload,
    });
  });
  return { resolve, calls };
}

function baseDto(overrides: Partial<CreateExpenseDto> = {}): CreateExpenseDto {
  return {
    supplierName: 'Acme Supplies',
    supplierTin: '000111222',
    supplierLicenceOnFile: true,
    supplyKind: 'GOODS',
    category: 'MATERIALS',
    expenseDate: '2020-06-15',
    paidVia: 'CASH',
    vatIncluded: false,
    netAmountEtb: '20000.00',
    ...overrides,
  };
}

describe('ExpensesService.record — WHT decision matrix wired end to end (brief 4.1)', () => {
  it('no TIN -> WHT_NO_TIN 30%, regardless of amount, rateVersionId stored', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    await service.record(
      USER,
      baseDto({ supplierTin: undefined, netAmountEtb: '1.00' }),
    );

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        whtRatePercent: '30.00',
        whtEtb: '0.30',
        rateVersionId: 'wht-no-tin-v1',
      }),
    );
  });

  it('TIN+licence, GOODS 19,999.99 -> 0%, rateVersionId still stored', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    await service.record(USER, baseDto({ netAmountEtb: '19999.99' }));

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        whtRatePercent: '0.00',
        whtEtb: '0.00',
        rateVersionId: 'wht-goods-v1',
      }),
    );
  });

  it('TIN+licence, GOODS 20,000.00 -> 3%', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    await service.record(USER, baseDto({ netAmountEtb: '20000.00' }));

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        whtRatePercent: '3.00',
        whtEtb: '600.00',
        rateVersionId: 'wht-goods-v1',
      }),
    );
  });

  it('TIN+licence, SERVICES 9,999.99 -> 0%', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    await service.record(
      USER,
      baseDto({ supplyKind: 'SERVICES', netAmountEtb: '9999.99' }),
    );

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        whtRatePercent: '0.00',
        whtEtb: '0.00',
        rateVersionId: 'wht-services-v1',
      }),
    );
  });

  it('TIN+licence, SERVICES 10,000.00 -> 3%', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    await service.record(
      USER,
      baseDto({ supplyKind: 'SERVICES', netAmountEtb: '10000.00' }),
    );

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        whtRatePercent: '3.00',
        whtEtb: '300.00',
        rateVersionId: 'wht-services-v1',
      }),
    );
  });

  it('resolves VAT and WHT at expenseDate, never at today (unless they coincide)', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);
    const pastDate = '2019-03-01'; // far enough in the past to never equal "today" in this test run

    await service.record(USER, baseDto({ expenseDate: pastDate }));

    expect(rates.calls).toEqual([
      { kind: 'VAT', onDate: pastDate },
      { kind: 'WHT_GOODS', onDate: pastDate },
    ]);
  });

  it('vatIncluded=true splits the gross into net/vat before the WHT decision (net drives the threshold, not gross)', async () => {
    const record = jest.fn(async (_t: string, _u: string, input: unknown) => input);
    const rates = makeRatesService();
    const service = new ExpensesService({ record } as never, rates as never);

    // gross 22999.99 @15% VAT-inclusive -> net ~19999.99..., below the
    // 20,000 GOODS threshold — proves the threshold compares NET, not gross.
    await service.record(
      USER,
      baseDto({ vatIncluded: true, netAmountEtb: undefined, grossAmountEtb: '22999.99' }),
    );

    expect(record).toHaveBeenCalledWith(
      USER.tenantId,
      USER.userId,
      expect.objectContaining({
        netAmountEtb: '19999.99',
        vatEtb: '3000.00',
        amountEtb: '22999.99',
        whtRatePercent: '0.00',
        whtEtb: '0.00',
      }),
    );
  });
});
