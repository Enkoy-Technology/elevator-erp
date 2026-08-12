import { recomputeCustomerBalance } from '../../common/customer-balance';
import { BalanceReconciliationRepository } from './balance-reconciliation.repository';

// recomputeCustomerBalance is Phase 4's own already-tested function
// (common/customer-balance.spec.ts) — mocked here so this spec only proves
// THIS repository's orchestration: list customers, compare stored vs
// derived, report a mismatch — not re-derive balance arithmetic that
// already has its own test file.
jest.mock('../../common/customer-balance', () => ({
  recomputeCustomerBalance: jest.fn(),
}));
const mockRecompute = recomputeCustomerBalance as jest.Mock;

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

type CustomerRow = { id: string; name: string };

/**
 * Wires a fake TenantDbService whose Nth withTenant call serves the query
 * `reconcileAll` issues at that point: call 0 is `listCustomers` (terminal
 * `.orderBy()`), every call after is one customer's `reconcileOne` (terminal
 * `.limit()`, reading `customers.outstandingBalanceEtb` for the id at that
 * position in `customerRows`).
 */
const repoWith = (customerRows: CustomerRow[], storedByCustomer: Record<string, string>) => {
  let call = 0;
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => {
      const index = call++;
      if (index === 0) {
        const chain: Record<string, jest.Mock> = {};
        chain.select = jest.fn(() => chain);
        chain.from = jest.fn(() => chain);
        chain.where = jest.fn(() => chain);
        chain.orderBy = jest.fn(() => Promise.resolve(customerRows));
        return fn({ select: chain.select });
      }
      const customer = customerRows[index - 1]!;
      const chain: Record<string, jest.Mock> = {};
      chain.select = jest.fn(() => chain);
      chain.from = jest.fn(() => chain);
      chain.where = jest.fn(() => chain);
      chain.limit = jest.fn(() =>
        Promise.resolve([{ stored: storedByCustomer[customer.id] }]),
      );
      return fn({ select: chain.select });
    },
  );
  const repo = new BalanceReconciliationRepository({ withTenant } as never);
  return { repo, withTenant };
};

describe('BalanceReconciliationRepository.reconcileAll', () => {
  beforeEach(() => {
    mockRecompute.mockReset();
  });

  it('reports no mismatch when stored already equals derived', async () => {
    const { repo } = repoWith(
      [{ id: 'c1', name: 'Addis Heights PLC' }],
      { c1: '500.00' },
    );
    mockRecompute.mockResolvedValueOnce('500.00');

    const result = await repo.reconcileAll(TENANT_ID);

    expect(result.customersChecked).toBe(1);
    expect(result.mismatches).toEqual([]);
  });

  it('reports a mismatch with BOTH the stored and the corrected value when they disagree', async () => {
    const { repo } = repoWith(
      [{ id: 'c1', name: 'Addis Heights PLC' }],
      { c1: '999.99' }, // deliberately corrupted stored value
    );
    mockRecompute.mockResolvedValueOnce('500.00'); // the true derived value

    const result = await repo.reconcileAll(TENANT_ID);

    expect(result.mismatches).toEqual([
      {
        customerId: 'c1',
        customerName: 'Addis Heights PLC',
        storedEtb: '999.99',
        correctedEtb: '500.00',
      },
    ]);
  });

  it('treats differently-formatted-but-equal amounts as no mismatch (Decimal comparison, not string equality)', async () => {
    const { repo } = repoWith([{ id: 'c1', name: 'Acme' }], { c1: '500.00' });
    mockRecompute.mockResolvedValueOnce('500.0'); // same value, different trailing zero

    const result = await repo.reconcileAll(TENANT_ID);

    expect(result.mismatches).toEqual([]);
  });

  it('checks every customer independently — one mismatch among several does not hide or duplicate the others', async () => {
    const { repo } = repoWith(
      [
        { id: 'c1', name: 'Customer One' },
        { id: 'c2', name: 'Customer Two' },
        { id: 'c3', name: 'Customer Three' },
      ],
      { c1: '100.00', c2: '999.00', c3: '300.00' },
    );
    mockRecompute
      .mockResolvedValueOnce('100.00') // c1 matches
      .mockResolvedValueOnce('200.00') // c2 mismatches
      .mockResolvedValueOnce('300.00'); // c3 matches

    const result = await repo.reconcileAll(TENANT_ID);

    expect(result.customersChecked).toBe(3);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]!.customerId).toBe('c2');
  });
});
