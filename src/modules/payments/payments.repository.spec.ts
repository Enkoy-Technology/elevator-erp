import { NotFoundException } from '@nestjs/common';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import type { InvoicesRepository } from '../invoices/invoices.repository';
import { PaymentsRepository, businessDayEnd, businessDayStart } from './payments.repository';

// Isolates "does PaymentsRepository WIRE the balance recompute correctly"
// from "is the balance formula itself correct" (covered by
// customer-balance.spec.ts) — same reasoning as invoices.repository.spec.ts.
jest.mock('../../common/customer-balance');
const mockCustomerBalance = jest.mocked(recomputeCustomerBalance);

beforeEach(() => {
  mockCustomerBalance.mockClear();
});

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';
const OTHER_CUSTOMER_ID = '99999999-9999-9999-9999-999999999999';
const PAYMENT_ID = '77777777-7777-7777-7777-777777777777';
const INVOICE_ID = '88888888-8888-8888-8888-888888888888';
const INVOICE_A_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const INVOICE_B_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

/** A fake select chain that is also "thenable" at any step — see invoices.repository.spec.ts's own copy for why. */
interface SelectChain {
  from: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  groupBy: jest.Mock;
  then: (resolve: (value: unknown) => void, reject: (err: unknown) => void) => void;
}

const makeSelectChain = (rows: unknown[]): SelectChain => {
  const chain = {} as SelectChain;
  chain.from = jest.fn(() => chain);
  chain.leftJoin = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.orderBy = jest.fn(() => chain);
  chain.limit = jest.fn(() => chain);
  chain.offset = jest.fn(() => chain);
  chain.groupBy = jest.fn(() => chain);
  chain.then = (resolve, reject) => {
    Promise.resolve(rows).then(resolve, reject);
  };
  return chain;
};

/** Wires a fake `insert().values().onConflictDoUpdate().returning()` chain (document_sequences claim). */
const makeSeqInsertChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn(() => chain);
  chain.onConflictDoUpdate = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `insert().values().returning()` chain, capturing the inserted values. */
const makeInsertChain = (returning: unknown[], onValues?: (v: unknown) => void) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: unknown) => {
    onValues?.(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

const makeInvoicesRepository = (): jest.Mocked<Pick<InvoicesRepository, 'recomputePaymentStatus'>> => ({
  recomputePaymentStatus: jest.fn().mockResolvedValue(undefined),
});

const makeExecute = () => jest.fn(() => Promise.resolve(undefined));

const fy = computeFiscalYear(todayIso(), '07-08');
const fyLabelSafe = fy.label.replace('/', '-');

describe('PaymentsRepository.record — one-transaction claim + insert + allocate (brief 3.1)', () => {
  it('claims a receipt number, inserts the payment, allocates against an invoice, and recomputes the customer balance', async () => {
    const invoiceRow = {
      id: INVOICE_ID,
      status: 'ISSUED',
      customerId: CUSTOMER_ID,
      totalEtb: '115.00',
      whtEtb: '3.00',
    };
    const select = jest
      .fn()
      // claimReceiptNumber: tenant fiscalYearStart
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // guardAndInsertAllocation: invoice lookup
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      // invoice-side Σ existing allocations
      .mockReturnValueOnce(makeSelectChain([{ total: '0' }]))
      // payment-side Σ existing allocations
      .mockReturnValueOnce(makeSelectChain([{ total: '0' }]));

    let insertedPayment: Record<string, unknown> = {};
    let insertedAllocation: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '112.00' }],
          (v) => (insertedPayment = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'alloc-1', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '112.00' }],
          (v) => (insertedAllocation = v as Record<string, unknown>),
        ),
      );
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    const result = await repo.record(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      amountEtb: '112.00',
      method: 'BANK_TRANSFER',
      bankAccountId: 'bank-1',
      allocations: [{ invoiceId: INVOICE_ID, amountEtb: '112.00' }],
    });

    expect(insertedPayment.receiptNumber).toBe(`RCT-${fyLabelSafe}-0001`);
    expect(insertedPayment.amountEtb).toBe('112.00');
    expect(insertedPayment.method).toBe('BANK_TRANSFER');
    expect(insertedPayment.bankAccountId).toBe('bank-1');
    expect(insertedAllocation.amountEtb).toBe('112.00');
    expect(insertedAllocation.paymentId).toBe(PAYMENT_ID);
    expect(insertedAllocation.invoiceId).toBe(INVOICE_ID);
    expect(result.allocations).toHaveLength(1);
    expect(invoicesRepository.recomputePaymentStatus).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
    );
    expect(mockCustomerBalance).toHaveBeenCalledWith(expect.anything(), TENANT_ID, CUSTOMER_ID);
  });

  it('an unallocated (advance/on-account) payment is legal — allocations omitted entirely', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 2 }]))
      .mockReturnValueOnce(
        makeInsertChain([{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '500.00' }]),
      );
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    const result = await repo.record(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      amountEtb: '500.00',
      method: 'CASH',
    });

    expect(result.allocations).toEqual([]);
    expect(invoicesRepository.recomputePaymentStatus).not.toHaveBeenCalled();
    expect(mockCustomerBalance).toHaveBeenCalledWith(expect.anything(), TENANT_ID, CUSTOMER_ID);
  });

  it('reclassifies a foreign-key violation (customerId/bankAccountId that does not resolve in this tenant) as NotFoundException (404) instead of an unhandled 500', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        // Real drizzle-orm/node-postgres shape — code lives on err.cause,
        // not err itself. See invoices.repository.spec.ts's own copy of
        // this shape for the unique-violation counterpart.
        const cause: Error & { code?: string } = new Error(
          'insert or update on table "payments" violates foreign key constraint "payments_customer_id_fkey"',
        );
        cause.code = '23503';
        const err: Error & { cause?: unknown } = new Error('Failed query: insert into "payments" ...');
        err.cause = cause;
        return Promise.reject(err);
      }),
    };
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(failingInsertChain);
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await expect(
      repo.record(TENANT_ID, USER_ID, {
        customerId: 'does-not-exist',
        amountEtb: '100.00',
        method: 'CASH',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PaymentsRepository.allocate — guards shared with record() via guardAndInsertAllocation (brief 3.2)', () => {
  const invoiceRow = {
    id: INVOICE_ID,
    status: 'ISSUED',
    customerId: CUSTOMER_ID,
    totalEtb: '115.00',
    whtEtb: '3.00',
  };

  const setup = (selectReturns: unknown[][], insertReturns?: unknown[]) => {
    const select = jest.fn();
    for (const rows of selectReturns) {
      select.mockReturnValueOnce(makeSelectChain(rows));
    }
    const insert = jest.fn();
    if (insertReturns) {
      insert.mockReturnValueOnce(makeInsertChain(insertReturns));
    }
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );
    return { repo, select, insert, execute, invoicesRepository };
  };

  it('rejects when the invoice belongs to a different customer than the payment (409, clear message)', async () => {
    const { repo } = setup([
      [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
      [{ ...invoiceRow, customerId: OTHER_CUSTOMER_ID }],
    ]);

    const err: unknown = await repo
      .allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00')
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WorkflowTransitionError);
    expect((err as Error).message).toMatch(/different customer/);
  });

  it('rejects a VOID invoice', async () => {
    const { repo } = setup([
      [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
      [{ ...invoiceRow, status: 'VOID' }],
    ]);

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('404s when the invoice does not exist', async () => {
    const { repo } = setup([
      [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
      [],
    ]);

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the payment does not exist', async () => {
    const { repo } = setup([[]]);

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('WHT-inclusive boundary from the brief: total 115.00, wht 3.00, already allocated 112.00 — a further 0.01 exceeds by one cent -> 409, never a silent clamp', async () => {
    const { repo, insert } = setup([
      [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
      [invoiceRow],
      [{ total: '112.00' }],
    ]);

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '0.01'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(insert).not.toHaveBeenCalled();
  });

  it('WHT-inclusive boundary: 111.99 allocated + 3.00 wht + 0.01 lands exactly on 115.00 — passes (not strictly over)', async () => {
    const { repo } = setup(
      [
        [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
        [invoiceRow],
        [{ total: '111.99' }],
        [{ total: '0' }],
      ],
      [{ id: 'alloc-x', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '0.01' }],
    );

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '0.01'),
    ).resolves.toBeDefined();
  });

  it("payment-total over-allocation: this payment's own allocations may not exceed its amountEtb, even with headroom on the invoice (409)", async () => {
    const { repo, insert } = setup([
      [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '100.00' }],
      [{ ...invoiceRow, totalEtb: '500.00', whtEtb: '0.00' }],
      [{ total: '0.00' }],
      [{ total: '60.00' }],
    ]);

    await expect(
      repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '45.00'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(insert).not.toHaveBeenCalled();
  });

  it('recomputes the invoice payment status and the customer balance on success', async () => {
    const { repo, invoicesRepository } = setup(
      [
        [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
        [invoiceRow],
        [{ total: '0' }],
        [{ total: '0' }],
      ],
      [{ id: 'alloc-1', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '10.00' }],
    );

    await repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00');

    expect(invoicesRepository.recomputePaymentStatus).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
    );
    expect(mockCustomerBalance).toHaveBeenCalledWith(expect.anything(), TENANT_ID, CUSTOMER_ID);
  });

  it('takes the advisory locks (payment, then invoice) before reading Σ existing invoice allocations', async () => {
    const { repo, select, execute } = setup(
      [
        [{ id: PAYMENT_ID, customerId: CUSTOMER_ID, amountEtb: '1000.00' }],
        [invoiceRow],
        [{ total: '0' }],
        [{ total: '0' }],
      ],
      [{ id: 'alloc-1', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '10.00' }],
    );

    await repo.allocate(TENANT_ID, PAYMENT_ID, INVOICE_ID, '10.00');

    expect(execute).toHaveBeenCalledTimes(2);
    const invoiceAllocatedSelectOrder = select.mock.invocationCallOrder[2]!;
    expect(execute.mock.invocationCallOrder[0]!).toBeLessThan(invoiceAllocatedSelectOrder);
    expect(execute.mock.invocationCallOrder[1]!).toBeLessThan(invoiceAllocatedSelectOrder);
  });
});

describe('PaymentsRepository.reverse — immutable ledger, new mirroring row (brief 3.3)', () => {
  const originalPayment = {
    id: PAYMENT_ID,
    customerId: CUSTOMER_ID,
    amountEtb: '150.00',
    method: 'CASH',
    bankAccountId: null,
    reference: null,
    note: null,
    reversalOfPaymentId: null,
  };
  const originalAllocations = [
    { id: 'a1', paymentId: PAYMENT_ID, invoiceId: INVOICE_B_ID, amountEtb: '50.00' },
    { id: 'a2', paymentId: PAYMENT_ID, invoiceId: INVOICE_A_ID, amountEtb: '100.00' },
  ];

  it('inserts a negated mirror payment with its own receipt number, mirrors every allocation negated, and recomputes affected invoices + the customer balance', async () => {
    const select = jest
      .fn()
      // claimReceiptNumber (now first, before either advisory lock — R2)
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([])) // no existing reversal
      .mockReturnValueOnce(makeSelectChain(originalAllocations))
      // B1b post-mirror-insert assertion loop, invoiceIds sorted ascending: A then B
      .mockReturnValueOnce(makeSelectChain([{ totalEtb: '500.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ total: '100.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ totalEtb: '500.00', whtEtb: '0.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ total: '50.00' }]));

    let insertedReversal: Record<string, unknown> = {};
    const insertedMirrors: Record<string, unknown>[] = [];
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 5 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ ...originalPayment, id: 'reversal-1', amountEtb: '-150.00' }],
          (v) => (insertedReversal = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'mirror-1', paymentId: 'reversal-1', invoiceId: INVOICE_B_ID, amountEtb: '-50.00' }],
          (v) => insertedMirrors.push(v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'mirror-2', paymentId: 'reversal-1', invoiceId: INVOICE_A_ID, amountEtb: '-100.00' }],
          (v) => insertedMirrors.push(v as Record<string, unknown>),
        ),
      );
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    const result = await repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'Duplicate entry');

    expect(insertedReversal.amountEtb).toBe('-150.00');
    expect(insertedReversal.reversalOfPaymentId).toBe(PAYMENT_ID);
    expect(insertedReversal.reverseReason).toBe('Duplicate entry');
    expect(insertedReversal.receiptNumber).toBe(`RCT-${fyLabelSafe}-0005`);
    expect(insertedMirrors[0]?.amountEtb).toBe('-50.00');
    expect(insertedMirrors[1]?.amountEtb).toBe('-100.00');
    expect(result.allocations).toHaveLength(2);

    // Locked (payment + both distinct invoices) before writing anything.
    expect(execute).toHaveBeenCalledTimes(3);

    const recomputedInvoiceIds = invoicesRepository.recomputePaymentStatus.mock.calls.map(
      ([, invoiceId]) => invoiceId,
    );
    expect(recomputedInvoiceIds).toEqual(
      expect.arrayContaining([INVOICE_A_ID, INVOICE_B_ID]),
    );
    expect(recomputedInvoiceIds).toHaveLength(2);
    expect(mockCustomerBalance).toHaveBeenCalledWith(expect.anything(), TENANT_ID, CUSTOMER_ID);
  });

  it('R2: claims the receipt number before locking the payment — every path acquires sequence -> payment -> invoices', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain([{ ...originalPayment, id: 'reversal-1', amountEtb: '-150.00' }]),
      );
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'reason');

    // insert[0] is the document_sequences claim; execute[0] is the payment
    // advisory lock. A concurrent record() already claims its number before
    // taking any advisory lock — this must acquire the two in the same
    // relative order, or Postgres can deadlock one of the two requests.
    expect(insert.mock.invocationCallOrder[0]!).toBeLessThan(execute.mock.invocationCallOrder[0]!);
  });

  it('B1a: rejects reversing a reversal (409) — a reversal payment can never itself be reversed', async () => {
    const alreadyAReversal = { ...originalPayment, id: 'reversal-1', reversalOfPaymentId: PAYMENT_ID };
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([alreadyAReversal]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]));
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await expect(
      repo.reverse(TENANT_ID, 'reversal-1', USER_ID, 'oops'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    // Only the receipt-number claim happened — never a second-order reversal insert.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('B1b (fix-wave-c #3): rejects a computed mirror allocation that is not <= 0, BEFORE ever attempting the insert — relative to the original allocation, not the invoice\'s absolute total', async () => {
    const corruptedAllocation = [
      // Standing in for whatever bug (today: none — B1a closes the only
      // known path) might one day feed this method an original allocation
      // that is not positive. The assertion must catch it regardless of
      // cause.
      { id: 'a1', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '-50.00' },
    ];
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([])) // no existing reversal
      .mockReturnValueOnce(makeSelectChain(corruptedAllocation));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain([{ ...originalPayment, id: 'reversal-1', amountEtb: '-150.00' }]),
      );
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    await expect(
      repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'reason'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    // Only the receipt claim + reversal payment insert happened — the
    // mirror allocation insert never ran.
    expect(insert).toHaveBeenCalledTimes(2);
    expect(invoicesRepository.recomputePaymentStatus).not.toHaveBeenCalled();
  });

  it('fix-wave-c #3: a reversal still succeeds against an invoice already over-allocated by out-of-band data — the relative assertion never looks at the invoice\'s absolute total at all', async () => {
    const singleAllocation = [
      { id: 'a1', paymentId: PAYMENT_ID, invoiceId: INVOICE_ID, amountEtb: '50.00' },
    ];
    // No invoice/allocated-total select is mocked, on purpose: this method
    // no longer queries the invoice's absolute state at all (see this
    // method's own B1b doc comment), so however far out of band some other
    // bug already pushed this invoice over its total, that has zero
    // bearing on whether ITS OWN allocations can shrink via a reversal —
    // proven here by there being nothing to over-allocate against in the
    // first place.
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([])) // no existing reversal
      .mockReturnValueOnce(makeSelectChain(singleAllocation));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain([{ ...originalPayment, id: 'reversal-1', amountEtb: '-150.00' }]),
      )
      .mockReturnValueOnce(
        makeInsertChain([
          { id: 'mirror-1', paymentId: 'reversal-1', invoiceId: INVOICE_ID, amountEtb: '-50.00' },
        ]),
      );
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    const result = await repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'reason');

    expect(result.allocations[0]?.amountEtb).toBe('-50.00');
    expect(invoicesRepository.recomputePaymentStatus).toHaveBeenCalledWith(
      expect.anything(),
      INVOICE_ID,
    );
  });

  it('blocks a double reversal (409) — a payment may be reversed at most once', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'existing-reversal' }]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]));
    const execute = makeExecute();

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const invoicesRepository = makeInvoicesRepository();
    const repo = new PaymentsRepository(
      { withTenant } as never,
      invoicesRepository as unknown as InvoicesRepository,
    );

    await expect(
      repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'Second attempt'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    // Only the receipt-number claim happened — never the reversal payment insert.
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('404s when the payment does not exist', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const insert = jest.fn().mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]));
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await expect(
      repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('locks the original payment before checking whether it was already reversed', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      .mockReturnValueOnce(makeSelectChain([originalPayment]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([]));
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(makeInsertChain([{ ...originalPayment, id: 'reversal-1', amountEtb: '-150.00' }]));
    const execute = makeExecute();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert, execute }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await repo.reverse(TENANT_ID, PAYMENT_ID, USER_ID, 'reason');

    // select[0] is the claimReceiptNumber tenant lookup (before the lock);
    // select[2] is the already-reversed check. The lock (execute[0]) must
    // fall after the claim but before that check.
    expect(execute.mock.invocationCallOrder[0]!).toBeLessThan(select.mock.invocationCallOrder[2]!);
  });
});

describe('PaymentsRepository.list — allocatedEtb aggregate (never per-row)', () => {
  it('joins the customer display name and attaches allocatedEtb via ONE aggregate query for the page', async () => {
    const select = jest
      .fn()
      // count()
      .mockReturnValueOnce(makeSelectChain([{ value: 1 }]))
      // page of payments joined to customers
      .mockReturnValueOnce(
        makeSelectChain([
          {
            id: PAYMENT_ID,
            customerId: CUSTOMER_ID,
            customerName: 'Acme',
            amountEtb: '112.00',
            reversalOfPaymentId: null,
          },
        ]),
      )
      // ONE aggregate query for the page's allocated sums.
      .mockReturnValueOnce(makeSelectChain([{ paymentId: PAYMENT_ID, total: '70.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const result = await repo.list(TENANT_ID, {});

    expect(result.items).toEqual([
      expect.objectContaining({
        id: PAYMENT_ID,
        customerName: 'Acme',
        allocatedEtb: '70.00',
      }),
    ]);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('defaults allocatedEtb to 0.00 for a payment with no allocations at all (unallocated advance/on-account cash)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ value: 1 }]))
      .mockReturnValueOnce(
        makeSelectChain([
          { id: PAYMENT_ID, customerId: CUSTOMER_ID, customerName: 'Acme', amountEtb: '500.00' },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([])); // no allocations for this payment
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const result = await repo.list(TENANT_ID, {});

    expect(result.items[0]).toEqual(expect.objectContaining({ allocatedEtb: '0.00' }));
  });

  it('skips the allocation aggregate query entirely when the page is empty', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ value: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const result = await repo.list(TENANT_ID, {});

    expect(result.items).toEqual([]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe('PaymentsRepository.streamAll — batched export with a PK tiebreaker', () => {
  it('orders by createdAt desc with id asc as the tiebreaker, and stops once a batch comes back short', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([
          { id: PAYMENT_ID, customerId: CUSTOMER_ID, customerName: 'Acme', amountEtb: '10.00' },
        ]),
      )
      .mockReturnValueOnce(makeSelectChain([])); // allocation aggregate for that one row
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const rows: unknown[] = [];
    for await (const row of repo.streamAll(TENANT_ID, {})) {
      rows.push(row);
    }

    expect(rows).toEqual([expect.objectContaining({ id: PAYMENT_ID, allocatedEtb: '0.00' })]);
    const pageChain = select.mock.results[0]!.value as SelectChain;
    expect(pageChain.orderBy).toHaveBeenCalledWith(expect.anything(), expect.anything());
  });
});

describe('businessDayStart / businessDayEnd — receivedAt from/to range filtering', () => {
  it('converts a calendar date to the UTC instant business-local midnight falls on (Africa/Addis_Ababa, fixed UTC+3, no DST)', () => {
    expect(businessDayStart('2026-01-15').toISOString()).toBe('2026-01-14T21:00:00.000Z');
  });

  it('businessDayEnd is exactly the next calendar day\'s businessDayStart — an exclusive upper bound', () => {
    expect(businessDayEnd('2026-01-15').getTime()).toBe(
      businessDayStart('2026-01-16').getTime(),
    );
  });
});

describe('PaymentsRepository.findByIdForDocument', () => {
  const paymentRow = {
    id: PAYMENT_ID,
    receiptNumber: 'RCT-FY2026-27-0001',
    receivedAt: new Date('2026-08-01T00:00:00.000Z'),
    customerName: 'Acme',
    amountEtb: '112.00',
    method: 'BANK_TRANSFER',
    reference: 'TXN-1',
    reversalOfPaymentId: null,
  };

  it('joins the customer display name and each allocation to its invoice number', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([paymentRow]))
      .mockReturnValueOnce(
        makeSelectChain([{ amountEtb: '112.00', invoiceNumber: 'INV-FY2026-27-0001' }]),
      );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const result = await repo.findByIdForDocument(TENANT_ID, PAYMENT_ID);

    expect(result?.receiptNumber).toBe('RCT-FY2026-27-0001');
    expect(result?.customerName).toBe('Acme');
    expect(result?.allocations).toEqual([
      { amountEtb: '112.00', invoiceNumber: 'INV-FY2026-27-0001' },
    ]);
    expect(result?.originalReceiptNumber).toBeNull();
  });

  it('looks up the original receipt number when this payment is a reversal', async () => {
    const reversalRow = { ...paymentRow, id: 'reversal-1', reversalOfPaymentId: PAYMENT_ID };
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([reversalRow]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChain([{ receiptNumber: 'RCT-FY2026-27-0001' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    const result = await repo.findByIdForDocument(TENANT_ID, 'reversal-1');

    expect(result?.originalReceiptNumber).toBe('RCT-FY2026-27-0001');
  });

  it('returns null when the payment does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new PaymentsRepository(
      { withTenant } as never,
      makeInvoicesRepository() as unknown as InvoicesRepository,
    );

    await expect(repo.findByIdForDocument(TENANT_ID, PAYMENT_ID)).resolves.toBeNull();
  });
});
