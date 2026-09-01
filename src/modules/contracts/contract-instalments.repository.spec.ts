import { BadRequestException } from '@nestjs/common';

import { WorkflowTransitionError } from '../../common/exceptions';
import { ContractInstalmentsRepository } from './contract-instalments.repository';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const CONTRACT_ID = '33333333-3333-3333-3333-333333333333';
const INSTALMENT_ID = '44444444-4444-4444-4444-444444444444';
const INVOICE_ID = '55555555-5555-5555-5555-555555555555';
const CUSTOMER_ID = '66666666-6666-6666-6666-666666666666';

/** Fake `select().from()[.innerJoin()][.leftJoin()][.where()][.orderBy()].limit()` chain. */
const makeSelectChain = (rows: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  const self = jest.fn(() => chain);
  chain.from = self;
  chain.innerJoin = self;
  chain.leftJoin = self;
  chain.where = self;
  // orderBy ends the chain on the unbounded reads, limit on the bounded ones.
  chain.orderBy = jest.fn(() => Promise.resolve(rows));
  chain.limit = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const makeInsertChain = (
  onValues: (v: Record<string, unknown>[]) => void,
  returning: unknown[],
) => {
  const chain: Record<string, jest.Mock> = {};
  chain.values = jest.fn((v: Record<string, unknown>[]) => {
    onValues(v);
    return chain;
  });
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

const makeUpdateChain = (returning: unknown[]) => {
  const chain: Record<string, jest.Mock> = {};
  chain.set = jest.fn(() => chain);
  chain.where = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(returning));
  return chain;
};

const makeDeleteChain = () => ({ where: jest.fn(() => Promise.resolve([])) });

const repoWith = (tx: Record<string, unknown>): ContractInstalmentsRepository =>
  new ContractInstalmentsRepository({
    withTenant: jest.fn(
      async (_tenantId: string, fn: (t: unknown) => Promise<unknown>) => fn(tx),
    ),
  } as never);

const LINES = [
  { label: 'Advance on signing', dueDate: '2026-09-05', amountEtb: '200000.00' },
  { label: 'On delivery', dueDate: null, amountEtb: '800000.00' },
];

describe('ContractInstalmentsRepository.replaceSchedule', () => {
  it('replaces the schedule on a DRAFT contract and numbers the rows from 1', async () => {
    const select = jest.fn(() =>
      makeSelectChain([
        { id: CONTRACT_ID, status: 'DRAFT', contractValueEtb: '1000000.00' },
      ]),
    );
    let inserted: Record<string, unknown>[] = [];
    const insert = jest.fn(() => makeInsertChain((v) => (inserted = v), []));
    const del = jest.fn(makeDeleteChain);

    await repoWith({ select, insert, delete: del }).replaceSchedule(
      TENANT_ID,
      CONTRACT_ID,
      LINES,
    );

    expect(del).toHaveBeenCalledTimes(1);
    expect(inserted.map((r) => r.sequence)).toEqual([1, 2]);
    expect(inserted[0]?.label).toBe('Advance on signing');
    expect(inserted[1]?.dueDate).toBeNull();
  });

  it('rejects a schedule that does not add up to the contract value', async () => {
    const select = jest.fn(() =>
      makeSelectChain([
        { id: CONTRACT_ID, status: 'DRAFT', contractValueEtb: '1500000.00' },
      ]),
    );
    const insert = jest.fn();
    const del = jest.fn(makeDeleteChain);

    await expect(
      repoWith({ select, insert, delete: del }).replaceSchedule(
        TENANT_ID,
        CONTRACT_ID,
        LINES,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Nothing was touched — the check happens before the delete.
    expect(del).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses to change the agreed amounts once the contract is SIGNED', async () => {
    const select = jest.fn(() =>
      makeSelectChain([
        { id: CONTRACT_ID, status: 'SIGNED', contractValueEtb: '1000000.00' },
      ]),
    );
    const del = jest.fn(makeDeleteChain);

    await expect(
      repoWith({ select, delete: del }).replaceSchedule(TENANT_ID, CONTRACT_ID, LINES),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(del).not.toHaveBeenCalled();
  });

  it('allows an empty schedule to clear a draft without a sum check', async () => {
    const select = jest.fn(() =>
      makeSelectChain([
        { id: CONTRACT_ID, status: 'DRAFT', contractValueEtb: '1000000.00' },
      ]),
    );
    const insert = jest.fn();
    const del = jest.fn(makeDeleteChain);

    await expect(
      repoWith({ select, insert, delete: del }).replaceSchedule(TENANT_ID, CONTRACT_ID, []),
    ).resolves.toEqual([]);
    expect(del).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('ContractInstalmentsRepository.markInvoiced', () => {
  const pendingOnSigned = {
    instalmentId: INSTALMENT_ID,
    instalmentStatus: 'PENDING',
    contractStatus: 'SIGNED',
    contractCustomerId: CUSTOMER_ID,
  };

  it('links the invoice and moves PENDING -> INVOICED', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([pendingOnSigned]))
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, customerId: CUSTOMER_ID }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const update = jest.fn(() =>
      makeUpdateChain([{ id: INSTALMENT_ID, status: 'INVOICED', invoiceId: INVOICE_ID }]),
    );

    const row = await repoWith({ select, update }).markInvoiced(
      TENANT_ID,
      CONTRACT_ID,
      INSTALMENT_ID,
      INVOICE_ID,
    );

    expect(row.status).toBe('INVOICED');
    expect(row.invoiceId).toBe(INVOICE_ID);
  });

  it('refuses to invoice against a contract nobody has signed', async () => {
    const select = jest.fn(() =>
      makeSelectChain([{ ...pendingOnSigned, contractStatus: 'DRAFT' }]),
    );
    const update = jest.fn();

    await expect(
      repoWith({ select, update }).markInvoiced(
        TENANT_ID,
        CONTRACT_ID,
        INSTALMENT_ID,
        INVOICE_ID,
      ),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects an invoice billed to a different customer', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([pendingOnSigned]))
      .mockReturnValueOnce(
        makeSelectChain([{ id: INVOICE_ID, customerId: 'someone-else' }]),
      );
    const update = jest.fn();

    await expect(
      repoWith({ select, update }).markInvoiced(
        TENANT_ID,
        CONTRACT_ID,
        INSTALMENT_ID,
        INVOICE_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('throws when the CAS misses — the instalment was already invoiced', async () => {
    const select = jest
      .fn()
      .mockReturnValueOnce(makeSelectChain([pendingOnSigned]))
      .mockReturnValueOnce(makeSelectChain([{ id: INVOICE_ID, customerId: CUSTOMER_ID }]))
      .mockReturnValueOnce(makeSelectChain([]));
    const update = jest.fn(() => makeUpdateChain([]));

    await expect(
      repoWith({ select, update }).markInvoiced(
        TENANT_ID,
        CONTRACT_ID,
        INSTALMENT_ID,
        INVOICE_ID,
      ),
    ).rejects.toBeInstanceOf(WorkflowTransitionError);
  });
});
