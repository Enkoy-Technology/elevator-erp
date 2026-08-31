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
  it('sums totalEtb - whtEtb - allocated across every non-VOID invoice (no payments -> no unapplied cash) and stores it', async () => {
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
      )
      // No payments for this customer at all.
      .mockReturnValueOnce(makeSelectChain([]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    // inv-1: 115 - 3 - 80 = 32.00; inv-2: 50 - 0 - 10 = 40.00 -> 72.00
    expect(balance).toBe('72.00');
    expect(setValues.outstandingBalanceEtb).toBe('72.00');
  });

  it('returns "0.00" and still writes it when the customer has no non-VOID invoices and no payments at all', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('0.00');
    expect(setValues.outstandingBalanceEtb).toBe('0.00');
    // No invoices -> skip the invoice-allocation query; no payments -> skip
    // the payment-allocation query. Only the two base reads happen.
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('treats an invoice with zero allocations recorded yet as fully outstanding', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: 'inv-1', totalEtb: '115.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));
    const update = jest.fn(() => makeUpdateChain());
    const tx = { select, update } as never;

    await expect(recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID)).resolves.toBe(
      '115.00',
    );
  });

  it('never floors at 0 — a negative result from the invoice side alone is stored as-is, not clamped', async () => {
    // Not reachable through the guarded allocation/withholding write paths
    // in ordinary operation (both enforce allocated + whtEtb <= totalEtb per
    // invoice, so every invoice's own contribution is normally >= 0) — this
    // proves the aggregate itself never clamps a negative sum, whatever
    // produced it (a correction, a future credit-note feature, direct DB
    // access), matching the brief's explicit "do not floor" instruction.
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: 'inv-1', totalEtb: '100.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ invoiceId: 'inv-1', total: '130.00' }]))
      .mockReturnValueOnce(makeSelectChain([]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('-30.00');
    expect(setValues.outstandingBalanceEtb).toBe('-30.00');
  });

  it('scopes the UPDATE to the given tenant + customer', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));
    const updateChain = makeUpdateChain();
    const update = jest.fn(() => updateChain);
    const tx = { select, update } as never;

    await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(update).toHaveBeenCalledTimes(1);
    expect(updateChain.where).toHaveBeenCalledTimes(1);
  });

  // Reviewer's worked disagreement (Finding 3): a 115.07 invoice, an 80.00
  // payment against it, of which only 60.03 is actually allocated. The old
  // per-invoice-only formula (== the aging report's own total) stops at
  // 55.04; the customer's own statement closes at 35.07 because it also
  // credits the 19.97 the customer paid but that has not been applied to
  // anything yet. The net formula must land on the statement's number.
  it("pins the reviewer's exact worked example: 115.07 invoice, 80.00 paid, 60.03 allocated -> net balance 35.07 (not the 55.04 per-invoice figure)", async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: 'inv-1', totalEtb: '115.07', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ invoiceId: 'inv-1', total: '60.03' }]))
      .mockReturnValueOnce(
        makeSelectChain([{ id: 'pay-1', amountEtb: '80.00', reversalOfPaymentId: null }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ paymentId: 'pay-1', total: '60.03' }]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    // Per-invoice term: 115.07 - 0 - 60.03 = 55.04 (== the aging figure).
    // Unapplied cash: 80.00 - 60.03 = 19.97. Net: 55.04 - 19.97 = 35.07.
    expect(balance).toBe('35.07');
    expect(setValues.outstandingBalanceEtb).toBe('35.07');
  });

  it('a genuine credit case: a payment exceeding all invoices produces a negative stored balance', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([])) // no invoices at all
      .mockReturnValueOnce(
        makeSelectChain([{ id: 'pay-1', amountEtb: '30.00', reversalOfPaymentId: null }]),
      )
      .mockReturnValueOnce(makeSelectChain([])); // fully unallocated
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('-30.00');
    expect(setValues.outstandingBalanceEtb).toBe('-30.00');
  });

  // Regression for the exact double-counting bug the brief warns about: a
  // naive "live == reversalOfPaymentId IS NULL" filter excludes reversal
  // rows but forgets to ALSO exclude the reversed ORIGINAL, so a fully
  // reversed, fully unallocated advance would still count once (-80.00
  // here) instead of net zero (-50.00, from the one genuinely live payment
  // only).
  it('excludes BOTH sides of a reversed payment pair from unapplied cash, not just the reversal row', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([])) // no invoices
      .mockReturnValueOnce(
        makeSelectChain([
          { id: 'pay-1', amountEtb: '50.00', reversalOfPaymentId: null }, // live, unallocated
          { id: 'pay-2', amountEtb: '30.00', reversalOfPaymentId: null }, // reversed original
          { id: 'pay-3', amountEtb: '-30.00', reversalOfPaymentId: 'pay-2' }, // the reversal
        ]),
      )
      // Only pay-1 is "live" -> only pay-1's id is ever queried for allocations.
      .mockReturnValueOnce(makeSelectChain([]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() => makeUpdateChain((v) => (setValues = v)));
    const tx = { select, update } as never;

    const balance = await recomputeCustomerBalance(tx, TENANT_ID, CUSTOMER_ID);

    expect(balance).toBe('-50.00');
    expect(setValues.outstandingBalanceEtb).toBe('-50.00');
  });
});
