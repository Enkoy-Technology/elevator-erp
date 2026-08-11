import { recomputeCustomerBalance } from './customer-balance';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';

/** A fake select chain that is also "thenable" at any step — same shape as InvoicesRepository's own test double. */
interface SelectChain {
  from: jest.Mock;
  where: jest.Mock;
  groupBy: jest.Mock;
  then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => void;
}

const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
  return chain;
};

const makeUpdateChain = (onSet?: (v: Record<string, unknown>) => void) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn((v: Record<string, unknown>) => {
    onSet?.(v);
    return chain;
  });
  chain.where = jest.fn(() => Promise.resolve(undefined));
  return chain;
};

describe('recomputeCustomerBalance', () => {
  it('sums totalEtb - whtEtb - allocated across every non-VOID invoice and stores it', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([
          { id: 'inv-1', totalEtb: '115.00', whtEtb: '3.00' },
          { id: 'inv-2', totalEtb: '50.00', whtEtb: '0.00' },
        ]),
      )
      .mockReturnValueOnce(
        makeSelectChain([
          { invoiceId: 'inv-1', total: '80.00' },
          { invoiceId: 'inv-2', total: '10.00' },
        ]),
      );
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    // inv-1: 115 - 3 - 80 = 32.00; inv-2: 50 - 0 - 10 = 40.00 -> 72.00
    expect(balance).toBe('72.00');
    expect(setValues.outstandingBalanceEtb).toBe('72.00');
  });

  it('returns "0.00" and still writes it when the customer has no non-VOID invoices at all', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('0.00');
    expect(setValues.outstandingBalanceEtb).toBe('0.00');
    // No invoices -> no reason to even query allocations.
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('treats an invoice with zero allocations recorded yet as fully outstanding', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: 'inv-1', totalEtb: '115.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const update = jest.fn(() => makeUpdateChain());
    const tx = { select, update } as never;

    await expect(recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID)).resolves.toBe(
      '115.00',
    );
  });

  it('never floors at 0 — a negative result (customer in credit) is stored as-is, not clamped', async () => {
    // Not reachable through the guarded allocation/withholding write paths
    // in ordinary operation (both enforce allocated + whtEtb <= totalEtb per
    // invoice, so every invoice's own contribution is normally >= 0) — this
    // proves the aggregate itself never clamps a negative sum, whatever
    // produced it (a correction, a future credit-note feature, direct DB
    // access), matching the brief's explicit "do not floor" instruction.
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: 'inv-1', totalEtb: '100.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ invoiceId: 'inv-1', total: '130.00' }]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('-30.00');
    expect(setValues.outstandingBalanceEtb).toBe('-30.00');
  });

  it('scopes the UPDATE to the given tenant + customer', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const updateChain = makeUpdateChain();
    const update = jest.fn(() => updateChain);
    const tx = { select, update } as never;

    await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(update).toHaveBeenCalledTimes(1);
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });
});
