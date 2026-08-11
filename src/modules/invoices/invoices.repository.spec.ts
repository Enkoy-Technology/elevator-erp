import { ConflictException, NotFoundException } from '@nestjs/common';

import { recomputeCustomerBalance } from '../../common/customer-balance';
import { WorkflowTransitionError } from '../../common/exceptions';
import { computeFiscalYear } from '../../common/fiscal-year';
import { todayIso } from '../../common/business-time';
import { InvoicesRepository } from './invoices.repository';

// Isolates "does this repository method WIRE the balance recompute
// correctly" (asserted here via mockCustomerBalance) from "is the balance
// formula itself correct" (exhaustively covered by customer-balance.spec.ts)
// — mocking the module means these tests don't also have to fake every
// select/update call recomputeCustomerBalance's real implementation makes.
jest.mock('../../common/customer-balance');
const mockCustomerBalance = jest.mocked(recomputeCustomerBalance);

beforeEach(() => {
  mockCustomerBalance.mockClear();
});

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const PROFORMA_ID = '33333333-3333-3333-3333-333333333333';
const PROJECT_ID = '55555555-5555-5555-5555-555555555555';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';
const RATE_VERSION_ID = '77777777-7777-7777-7777-777777777777';
const INVOICE_ID = '88888888-8888-8888-8888-888888888888';

const proformaRow = {
  id: PROFORMA_ID,
  status: 'ISSUED',
  projectId: PROJECT_ID,
  customerId: CUSTOMER_ID,
  subtotalEtb: '100.00',
  vatEtb: '15.00',
  totalEtb: '115.00',
  rateVersionId: RATE_VERSION_ID,
};

/** A fake select chain that is also "thenable" at any step. */
interface SelectChain {
  from: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
  groupBy: jest.Mock;
  then: (
    resolve: (value: unknown) => void,
    reject: (err: unknown) => void,
  ) => void;
}

/**
 * A drizzle select query builder is "thenable" at any chain step (awaiting
 * mid-chain resolves it) — this fake replicates that instead of hard-coding
 * one fixed call shape per site, so the same helper covers every
 * .select().from().where()[.orderBy()][.limit()] shape in the repository,
 * including ones that are never awaited at all (e.g. the notExists()
 * subquery in voidInvoice — its chain methods just need to return the
 * chain, since notExists() only stores the object as a raw SQL chunk and
 * never awaits or introspects it in a unit test that never renders SQL).
 */
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
const makeInsertChain = (
  returning: unknown[],
  onValues?: (v: unknown) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: unknown) => {
    onValues?.(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

/** Wires a fake `update().set().where().returning()` chain, capturing the set() values. */
const makeUpdateChain = (
  returning: unknown[],
  onSet?: (v: Record<string, unknown>) => void,
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn((v: Record<string, unknown>) => {
    onSet?.(v);
    return chain;
  });
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

describe('InvoicesRepository.issueFromProforma — one-transaction CAS + claim + insert', () => {
  it('claims a gapless INV number and copies the proforma money columns verbatim', async () => {
    const select = jest
      .fn()
      // 1. load proforma
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      // 2. VAT staleness check — open version matches proforma's rateVersionId
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      // 3. tenant fiscalYearStart
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // 4. R4: resolveDueDate's customer lookup (dueDate was omitted -> null)
      .mockReturnValueOnce(makeSelectChain([{ paymentTermsDays: '30' }]))
      // 5. project name for the presentational line
      .mockReturnValueOnce(makeSelectChain([{ name: 'Bole Tower' }]));

    let insertedInvoice: Record<string, unknown> = {};
    let insertedLine: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ ...proformaRow, id: INVOICE_ID, invoiceNumber: 'x' }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'line-1' }],
          (v) => (insertedLine = v as Record<string, unknown>),
        ),
      );

    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null);

    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(insertedInvoice.invoiceNumber).toBe(`INV-${fy.label.replace('/', '-')}-0001`);
    expect(insertedInvoice.proformaId).toBe(PROFORMA_ID);
    expect(insertedInvoice.customerId).toBe(CUSTOMER_ID);
    expect(insertedInvoice.projectId).toBe(PROJECT_ID);
    expect(insertedInvoice.subtotalEtb).toBe('100.00');
    expect(insertedInvoice.vatEtb).toBe('15.00');
    expect(insertedInvoice.totalEtb).toBe('115.00');
    expect(insertedInvoice.rateVersionId).toBe(RATE_VERSION_ID);
    expect(insertedInvoice.issuedByUserId).toBe(USER_ID);
    // R4: dueDate was omitted (null) -> defaulted to issue date + the
    // customer's paymentTermsDays (30).
    expect(insertedInvoice.dueDate).toBe(daysAfterIso(30));
    expect(insertedLine.description).toBe('Supply and installation — Bole Tower');
    expect(insertedLine.lineTotalEtb).toBe('100.00');
    expect(result.lines).toHaveLength(1);
  });

  it('throws NotFoundException when the proforma does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws WorkflowTransitionError (409) when the proforma is not ISSUED (e.g. CANCELLED)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...proformaRow, status: 'CANCELLED' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when the open VAT version does not match the proforma\'s rateVersionId (VAT has rotated since pricing)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      // Open VAT version id differs from proformaRow.rateVersionId.
      .mockReturnValueOnce(makeSelectChain([{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when there is no open VAT version at all', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('reclassifies a unique-constraint violation on insert (double-convert) as ConflictException (409) — real driver shape: code lives on err.cause, not err itself', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([proformaRow]))
      .mockReturnValueOnce(makeSelectChain([{ id: RATE_VERSION_ID }]))
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // R4: resolveDueDate's customer lookup (dueDate omitted -> null)
      .mockReturnValueOnce(makeSelectChain([{ paymentTermsDays: '30' }]))
      .mockReturnValueOnce(makeSelectChain([{ name: 'Bole Tower' }]));

    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        // Matches drizzle-orm's real DrizzleQueryError shape (errors.js):
        // the pg driver's raw error (carrying `.code`) is wrapped as
        // `.cause`, NOT set directly on the thrown error. A test double
        // that instead set `err.code` directly would never have caught
        // that isUniqueViolation was checking the wrong property — see
        // this function's own doc comment for how this was actually found
        // (a real double-convert 409 in the e2e happy-path suite).
        const cause: Error & { code?: string } = new Error('duplicate key value violates unique constraint "invoices_proforma_uk"');
        cause.code = '23505';
        const err: Error & { cause?: unknown } = new Error('Failed query: insert into "invoices" ...');
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
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.issueFromProforma(TENANT_ID, USER_ID, PROFORMA_ID, null),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('InvoicesRepository.createStandalone — claim + insert invoice + lines', () => {
  it('claims a gapless INV number and inserts the invoice with the pre-computed lines', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // R4: resolveDueDate's customer lookup (dueDate omitted -> null)
      .mockReturnValueOnce(makeSelectChain([{ paymentTermsDays: '45' }]));
    let insertedInvoice: Record<string, unknown> = {};
    let insertedLines: unknown;
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 7 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: INVOICE_ID, invoiceNumber: 'x', customerId: CUSTOMER_ID }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: 'line-1' }, { id: 'line-2' }],
          (v) => (insertedLines = v),
        ),
      );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const lines = [
      {
        lineNo: 1,
        description: 'Maintenance visit',
        quantity: '3.333',
        unitPriceEtb: '10.00',
        lineTotalEtb: '33.33',
      },
    ];
    const result = await repo.createStandalone(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      projectId: null,
      dueDate: null,
      subtotalEtb: '33.33',
      vatEtb: '5.00',
      totalEtb: '38.33',
      rateVersionId: RATE_VERSION_ID,
      lines,
    });

    const fy = computeFiscalYear(todayIso(), '07-08');
    expect(insertedInvoice.invoiceNumber).toBe(`INV-${fy.label.replace('/', '-')}-0007`);
    expect(insertedInvoice.proformaId).toBeNull();
    expect(insertedInvoice.customerId).toBe(CUSTOMER_ID);
    expect(insertedInvoice.subtotalEtb).toBe('33.33');
    expect(insertedInvoice.totalEtb).toBe('38.33');
    // R4: dueDate was omitted (null) -> defaulted to issue date + the
    // customer's paymentTermsDays (45).
    expect(insertedInvoice.dueDate).toBe(daysAfterIso(45));
    expect(Array.isArray(insertedLines)).toBe(true);
    expect((insertedLines as Record<string, unknown>[])[0]?.description).toBe(
      'Maintenance visit',
    );
    expect(result.lines).toHaveLength(2);
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
  });

  it('reclassifies a foreign-key violation (customerId/projectId that does not resolve in this tenant) as NotFoundException (404) instead of an unhandled 500', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // R4: resolveDueDate's customer lookup finds no row for a
      // non-existent customerId — degrades to a null dueDate rather than
      // throwing; the insert below still 404s the same way it always did.
      .mockReturnValueOnce(makeSelectChain([]));
    const failingInsertChain: Record<string, jest.Mock> = {
      values: jest.fn(() => failingInsertChain),
      returning: jest.fn(() => {
        const cause: Error & { code?: string } = new Error(
          'insert or update on table "invoices" violates foreign key constraint "invoices_customer_id_fkey"',
        );
        cause.code = '23503';
        const err: Error & { cause?: unknown } = new Error('Failed query: insert into "invoices" ...');
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
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.createStandalone(TENANT_ID, USER_ID, {
        customerId: 'does-not-exist',
        projectId: null,
        dueDate: null,
        subtotalEtb: '100.00',
        vatEtb: '15.00',
        totalEtb: '115.00',
        rateVersionId: RATE_VERSION_ID,
        lines: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('R4: passes a caller-supplied dueDate through unchanged, with no customer lookup at all', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]));
    let insertedInvoice: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: INVOICE_ID, invoiceNumber: 'x', customerId: CUSTOMER_ID }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(makeInsertChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await repo.createStandalone(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      projectId: null,
      dueDate: '2026-09-30',
      subtotalEtb: '100.00',
      vatEtb: '15.00',
      totalEtb: '115.00',
      rateVersionId: RATE_VERSION_ID,
      lines: [],
    });

    expect(insertedInvoice.dueDate).toBe('2026-09-30');
    // Only the fiscalYearForToday select — resolveDueDate never runs a
    // customer lookup when the caller already supplied a due date.
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('R4: never fabricates a due date when the customer cannot be resolved — leaves dueDate null rather than aging from issue', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ fiscalYearStart: '07-08' }]))
      // resolveDueDate's customer lookup finds no row.
      .mockReturnValueOnce(makeSelectChain([]));
    let insertedInvoice: Record<string, unknown> = {};
    const insert = jest
      .fn()
      .mockReturnValueOnce(makeSeqInsertChain([{ lastValue: 1 }]))
      .mockReturnValueOnce(
        makeInsertChain(
          [{ id: INVOICE_ID, invoiceNumber: 'x', customerId: CUSTOMER_ID }],
          (v) => (insertedInvoice = v as Record<string, unknown>),
        ),
      )
      .mockReturnValueOnce(makeInsertChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, insert }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await repo.createStandalone(TENANT_ID, USER_ID, {
      customerId: CUSTOMER_ID,
      projectId: null,
      dueDate: null,
      subtotalEtb: '100.00',
      vatEtb: '15.00',
      totalEtb: '115.00',
      rateVersionId: RATE_VERSION_ID,
      lines: [],
    });

    expect(insertedInvoice.dueDate).toBeNull();
  });
});

describe('InvoicesRepository.voidInvoice — only from ISSUED, zero allocations, no recorded withholding', () => {
  const voidableInvoiceRow = {
    id: INVOICE_ID,
    status: 'ISSUED',
    customerId: CUSTOMER_ID,
    whtEtb: '0.00',
  };

  it('takes the per-invoice advisory lock before reading the invoice', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([voidableInvoiceRow]))
      // No allocations — aggregate query, one row, sum null/0.
      .mockReturnValueOnce(makeSelectChain([{ total: '0.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain([{ ...voidableInvoiceRow, status: 'VOID' }]),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await repo.voidInvoice(TENANT_ID, INVOICE_ID, 'Issued in error');

    expect(execute).toHaveBeenCalledTimes(1);
    const lockOrder = execute.mock.invocationCallOrder[0]!;
    const selectOrder = select.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(selectOrder);
  });

  it('voids and stores the reason when every guard passes', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([voidableInvoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '0.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, status: 'VOID', customerId: CUSTOMER_ID }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.voidInvoice(TENANT_ID, INVOICE_ID, 'Issued in error');

    expect(result.status).toBe('VOID');
    expect(setValues.status).toBe('VOID');
    expect(setValues.voidReason).toBe('Issued in error');
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
  });

  it('throws NotFoundException when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws WorkflowTransitionError (409) when the invoice is not ISSUED (e.g. already PARTIALLY_PAID)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ ...voidableInvoiceRow, status: 'PARTIALLY_PAID' }]),
      );
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('throws WorkflowTransitionError (409) when the invoice has a non-zero net payment allocation balance', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([voidableInvoiceRow]))
      // Σ allocations is non-zero.
      .mockReturnValueOnce(makeSelectChain([{ total: '150.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('R1: nets a fully-reversed allocation pair (+X and -X) to zero — voidable even though allocation ROWS still exist (bounced cheque, the most common reversal in this market)', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([voidableInvoiceRow]))
      // +500.00 (the original allocation) and -500.00 (its reversal mirror)
      // net to zero — an EXISTENCE check would still see rows here and
      // wrongly block voiding forever.
      .mockReturnValueOnce(makeSelectChain([{ total: '0.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, status: 'VOID', customerId: CUSTOMER_ID }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.voidInvoice(
      TENANT_ID,
      INVOICE_ID,
      'Bounced cheque, invoice cleared',
    );

    expect(result.status).toBe('VOID');
    expect(setValues.status).toBe('VOID');
  });

  it('throws WorkflowTransitionError (409) when the invoice already has a recorded withholding credit (whtEtb > 0) — never silently discards the voucher', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...voidableInvoiceRow, whtEtb: '3.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.voidInvoice(TENANT_ID, INVOICE_ID, 'reason'),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    // Short-circuits before ever checking allocations.
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe('InvoicesRepository.patchFiscal — manual ETR mirror, works on any non-VOID status', () => {
  it('sets only the whitelisted fiscal columns present in the patch', async () => {
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, fiscalReceiptNumber: 'ETR-1' }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await repo.patchFiscal(TENANT_ID, INVOICE_ID, { fiscalReceiptNumber: 'ETR-1' });

    expect(setValues.fiscalReceiptNumber).toBe('ETR-1');
    expect(setValues.fiscalDeviceSerial).toBeUndefined();
  });

  it('throws WorkflowTransitionError when the invoice is VOID (guard fails)', async () => {
    const update = jest.fn(() => makeUpdateChain([]));
    const select = jest.fn(() => makeSelectChain([{ id: INVOICE_ID }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update, select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.patchFiscal(TENANT_ID, INVOICE_ID, { fiscalNote: 'x' }),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });
});

describe('InvoicesRepository.recomputePaymentStatus', () => {
  it('is a no-op on a VOID invoice — never re-derives status away from VOID', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, status: 'VOID', totalEtb: '115.00', whtEtb: '0.00' }]));
    const update = jest.fn();
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('VOID');
    expect(update).not.toHaveBeenCalled();
  });

  it('CASes ISSUED -> PARTIALLY_PAID off the actual Σ allocations', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ id: INVOICE_ID, status: 'ISSUED', totalEtb: '115.00', whtEtb: '0.00' }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ total: '50.00' }]));
    let setValues: Record<string, unknown> = {};
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ id: INVOICE_ID, status: 'PARTIALLY_PAID' }],
        (v) => (setValues = v),
      ),
    );
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('PARTIALLY_PAID');
    expect(setValues.status).toBe('PARTIALLY_PAID');
  });

  it('is a no-op (no update call) when the derived status equals the current status', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(
        makeSelectChain([{ id: INVOICE_ID, status: 'ISSUED', totalEtb: '115.00', whtEtb: '0.00' }]),
      )
      .mockReturnValueOnce(makeSelectChain([{ total: '0.00' }]));
    const update = jest.fn();
    const tx = { select, update } as never;
    const repo = new InvoicesRepository({} as never);

    const result = await repo.recomputePaymentStatus(tx, INVOICE_ID);

    expect(result.status).toBe('ISSUED');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('InvoicesRepository.findByIdWithLines', () => {
  it('returns the invoice with its lines ordered by lineNo', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, invoiceNumber: 'INV-1' }]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'l1', lineNo: 1 }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.findByIdWithLines(TENANT_ID, INVOICE_ID);

    expect(result?.invoiceNumber).toBe('INV-1');
    expect(result?.lines).toEqual([{ id: 'l1', lineNo: 1 }]);
  });

  it('returns null when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(repo.findByIdWithLines(TENANT_ID, INVOICE_ID)).resolves.toBeNull();
  });
});

describe('InvoicesRepository.findByIdForDocument', () => {
  it('joins customers and projects (for display names only) and returns the row with its lines', async () => {
    const joinedRow = {
      id: INVOICE_ID,
      invoiceNumber: 'INV-FY2026-27-0001',
      customerName: 'Acme',
      projectName: 'Bole Tower',
      subtotalEtb: '100000.00',
      vatEtb: '15000.00',
      totalEtb: '115000.00',
      whtEtb: '0.00',
    };
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([joinedRow]))
      .mockReturnValueOnce(makeSelectChain([{ id: 'l1', lineNo: 1, description: 'Elevator unit' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.findByIdForDocument(TENANT_ID, INVOICE_ID);

    expect(result?.invoiceNumber).toBe('INV-FY2026-27-0001');
    expect(result?.customerName).toBe('Acme');
    expect(result?.projectName).toBe('Bole Tower');
    expect(result?.lines).toEqual([{ id: 'l1', lineNo: 1, description: 'Elevator unit' }]);
  });

  it('returns null when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(repo.findByIdForDocument(TENANT_ID, INVOICE_ID)).resolves.toBeNull();
  });
});

describe('InvoicesRepository.recordWithholding — Task 3 (3.4)', () => {
  const invoiceRow = {
    id: INVOICE_ID,
    status: 'ISSUED',
    customerId: CUSTOMER_ID,
    totalEtb: '115.00',
    whtEtb: '0.00',
  };

  /** recomputePaymentStatus's own correctness is covered by its own describe block above — spy it out here so these tests only assert the withholding-specific guard + wiring. */
  const stubRecomputePaymentStatus = (
    repo: InvoicesRepository,
  ): jest.SpyInstance =>
    jest
      .spyOn(repo, 'recomputePaymentStatus')
      .mockResolvedValue({ ...invoiceRow, status: 'PAID' } as never);

  it('takes the per-invoice advisory lock before reading the invoice', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() => makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    await repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' });

    expect(execute).toHaveBeenCalledTimes(1);
    const lockOrder = execute.mock.invocationCallOrder[0]!;
    const selectOrder = select.mock.invocationCallOrder[0]!;
    expect(lockOrder).toBeLessThan(selectOrder);
  });

  it('sets whtEtb/whtVoucherRef/whtRecordedAt as an absolute set, then recomputes status + customer balance', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }], (v) => (setValues = v)),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    const recomputeSpy = stubRecomputePaymentStatus(repo);

    const result = await repo.recordWithholding(TENANT_ID, INVOICE_ID, {
      amountEtb: '3.00',
      voucherRef: 'WHT-001',
      recordedAt: '2026-09-01T00:00:00Z',
    });

    expect(setValues.whtEtb).toBe('3.00');
    expect(setValues.whtVoucherRef).toBe('WHT-001');
    expect(setValues.whtRecordedAt).toEqual(new Date('2026-09-01T00:00:00Z'));
    expect(recomputeSpy).toHaveBeenCalledWith(expect.anything(), INVOICE_ID);
    expect(mockCustomerBalance).toHaveBeenCalledWith(
      expect.anything(),
      TENANT_ID,
      CUSTOMER_ID,
    );
    // Regression: the returned row must be recomputePaymentStatus's fresh
    // result, not the pre-recompute row captured by the earlier UPDATE — a
    // withholding credit that just completed settlement must come back PAID
    // in the SAME response, not one call behind.
    expect(result.status).toBe('PAID');
  });

  it('B2: a zero-set (amountEtb "0.00") clears whtVoucherRef/whtRecordedAt to null alongside whtEtb — the correction for a mis-keyed voucher', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...invoiceRow, whtEtb: '3.00' }]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain(
        [{ ...invoiceRow, whtEtb: '0.00', whtVoucherRef: null, whtRecordedAt: null }],
        (v) => (setValues = v),
      ),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    await repo.recordWithholding(TENANT_ID, INVOICE_ID, {
      amountEtb: '0.00',
      // Even if a stale voucherRef/recordedAt were passed alongside the
      // zero-set, the zero-set wins — there is no correct voucher for a
      // credit that no longer exists.
      voucherRef: 'WHT-STALE',
      recordedAt: '2026-01-01T00:00:00Z',
    });

    expect(setValues.whtEtb).toBe('0.00');
    expect(setValues.whtVoucherRef).toBeNull();
    expect(setValues.whtRecordedAt).toBeNull();
  });

  it('voucherRef omitted -> stored as null; recordedAt omitted -> defaults to now', async () => {
    let setValues: Record<string, unknown> = {};
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() =>
      makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }], (v) => (setValues = v)),
    );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    const before = Date.now();
    await repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' });
    const after = Date.now();

    expect(setValues.whtVoucherRef).toBeNull();
    expect(setValues.whtRecordedAt).toBeInstanceOf(Date);
    const recordedAtMs = (setValues.whtRecordedAt as Date).getTime();
    expect(recordedAtMs).toBeGreaterThanOrEqual(before);
    expect(recordedAtMs).toBeLessThanOrEqual(after);
  });

  it('boundary: allocated 112 + wht 3.00 == total 115.00 passes (not strictly over)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn(() => makeUpdateChain([{ ...invoiceRow, whtEtb: '3.00' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);
    stubRecomputePaymentStatus(repo);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).resolves.toBeDefined();
  });

  it('boundary: allocated 112 + wht 3.01 exceeds total 115.00 by one cent -> ConflictException (409), never a silent clamp', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([invoiceRow]))
      .mockReturnValueOnce(makeSelectChain([{ total: '112.00' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const update = jest.fn();
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute, update }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.01' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a VOID invoice', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ ...invoiceRow, status: 'VOID' }]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });

  it('404s when the invoice does not exist', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const execute = jest.fn(() => Promise.resolve(undefined));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({ select, execute }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(
      repo.recordWithholding(TENANT_ID, INVOICE_ID, { amountEtb: '3.00' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('InvoicesRepository.list — allocatedEtb/outstandingEtb aggregate (never per-row)', () => {
  it('computes outstandingEtb = totalEtb - whtEtb - allocatedEtb via ONE aggregate query for the whole page', async () => {
    const select = jest
      .fn()
      // count()
      .mockReturnValueOnce(makeSelectChain([{ value: 1 }]))
      // page of invoices
      .mockReturnValueOnce(
        makeSelectChain([
          { id: 'inv-1', status: 'PARTIALLY_PAID', totalEtb: '115.07', whtEtb: '0.00' },
        ]),
      )
      // ONE aggregate query for the page's allocated sums — never a query per invoice.
      .mockReturnValueOnce(makeSelectChain([{ invoiceId: 'inv-1', total: '60.03' }]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.list(TENANT_ID, {});

    // Same worked example as common/customer-balance.spec.ts's "pins the
    // reviewer's exact worked example" test (115.07 - 0.00 - 60.03 = 55.04,
    // its own per-invoice term before the unapplied-cash adjustment) and as
    // agingReport's identical formula below — all three call sites must
    // land on the same cents figure, see InvoicesRepository.withOutstanding's
    // own doc comment for why.
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'inv-1',
        allocatedEtb: '60.03',
        outstandingEtb: '55.04',
      }),
    ]);
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('forces outstandingEtb to 0.00 for a VOID invoice instead of the literal formula (VOID invoices always have zero allocations/wht by construction — voidInvoice\'s own guards — so a literal application would wrongly show the full totalEtb as owed)', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ value: 1 }]))
      .mockReturnValueOnce(
        makeSelectChain([{ id: 'inv-2', status: 'VOID', totalEtb: '200.00', whtEtb: '0.00' }]),
      )
      .mockReturnValueOnce(makeSelectChain([])); // no allocations
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.list(TENANT_ID, {});

    expect(result.items[0]).toEqual(
      expect.objectContaining({ allocatedEtb: '0.00', outstandingEtb: '0.00' }),
    );
  });

  it('skips the allocation aggregate query entirely when the page is empty', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([{ value: 0 }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.list(TENANT_ID, {});

    expect(result.items).toEqual([]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe('InvoicesRepository.agingReport — Task 3 (3.6)', () => {
  const TODAY = todayIso();

  it('buckets outstanding amounts per customer, excluding invoices with <= 0 outstanding and VOID invoices', async () => {
    const rows = [
      // Fully paid — outstanding 0, must be excluded.
      {
        invoiceId: 'inv-paid',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '100.00',
        whtEtb: '0.00',
        dueDate: TODAY,
        issuedAt: new Date(),
      },
      // 40 days overdue, 60.00 outstanding.
      {
        invoiceId: 'inv-overdue',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '60.00',
        whtEtb: '0.00',
        dueDate: daysAgoIso(40),
        issuedAt: new Date(),
      },
    ];
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain(rows))
      .mockReturnValueOnce(
        makeSelectChain([{ invoiceId: 'inv-paid', total: '100.00' }]),
      );
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.agingReport(TENANT_ID);

    expect(result).toEqual([
      {
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        current: '0.00',
        d1_30: '0.00',
        d31_60: '60.00',
        d61_90: '0.00',
        d90_plus: '0.00',
        total: '60.00',
      },
    ]);
  });

  it('returns an empty array (and skips the allocation query) when there are no non-VOID invoices', async () => {
    const select = jest.fn().mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    await expect(repo.agingReport(TENANT_ID)).resolves.toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('R4: a null dueDate (no-terms customer) buckets as current, NEVER aged from the invoice\'s own issue date — the regression this fixes: an invoice issued long ago with no dueDate used to fall into d31_60/etc. here', async () => {
    const rows = [
      {
        invoiceId: 'inv-no-terms',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '60.00',
        whtEtb: '0.00',
        dueDate: null,
        // Issued 40 days ago — the OLD (buggy) fallback would have aged
        // this into d31_60. Kept in the fixture to prove it is never read.
        issuedAt: new Date(daysAgoIso(40)),
      },
    ];
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain(rows))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.agingReport(TENANT_ID);

    expect(result).toEqual([
      {
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        current: '60.00',
        d1_30: '0.00',
        d31_60: '0.00',
        d61_90: '0.00',
        d90_plus: '0.00',
        total: '60.00',
      },
    ]);
  });

  it('R4: an invoice issued today for a 30-day-terms customer is current the day after issue (default dueDate = issue + 30 days is nowhere near overdue)', async () => {
    const rows = [
      {
        invoiceId: 'inv-fresh',
        customerId: CUSTOMER_ID,
        customerName: 'Acme',
        totalEtb: '100.00',
        whtEtb: '0.00',
        dueDate: daysAfterIso(29), // issued yesterday with 30-day terms
        issuedAt: new Date(daysAgoIso(1)),
      },
    ];
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain(rows))
      .mockReturnValueOnce(makeSelectChain([]));
    const withTenant = jest.fn(
      async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({ select }),
    );
    const repo = new InvoicesRepository({ withTenant } as never);

    const result = await repo.agingReport(TENANT_ID);

    expect(result[0]).toEqual(expect.objectContaining({ current: '100.00', d1_30: '0.00' }));
  });
});

/** ISO date string N days before business-time "today", for aging fixtures. */
function daysAgoIso(days: number): string {
  const d = new Date(`${todayIso()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** ISO date string N days after business-time "today" — R4's resolveDueDate uses this same UTC-midnight math. */
function daysAfterIso(days: number): string {
  return daysAgoIso(-days);
}
