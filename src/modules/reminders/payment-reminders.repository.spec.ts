import { todayIso } from '../../common/business-time';
import { PaymentReminderRepository } from './payment-reminders.repository';

type Row = Record<string, unknown>;

const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const TENANT_ID = '22222222-2222-2222-2222-222222222222';
const TODAY = todayIso();

const invoiceRow = (overrides: Row = {}): Row => ({
  invoiceId: 'inv-1',
  invoiceNumber: 'INV-0001',
  dueDate: TODAY,
  totalEtb: '1000.00',
  whtEtb: '0',
  customerId: 'cust-1',
  customerName: 'Addis Heights PLC',
  customerPhone: '+251949922604',
  customerSmsConsentAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

const buildTx = (opts: {
  offsets?: number[];
  invoiceRows: Row[];
  allocationRows?: Row[];
}) => {
  const tenantChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(() =>
      Promise.resolve(opts.offsets ? [{ offsets: opts.offsets }] : []),
    ),
  };
  const invoicesChain = {
    from: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn(() => Promise.resolve(opts.invoiceRows)),
  };
  const allocationsChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn(() => Promise.resolve(opts.allocationRows ?? [])),
  };
  const select = jest
    .fn()
    .mockReturnValueOnce(tenantChain)
    .mockReturnValueOnce(invoicesChain)
    .mockReturnValueOnce(allocationsChain);
  return { select, tenantChain, invoicesChain, allocationsChain };
};

const repoWith = (opts: Parameters<typeof buildTx>[0]) => {
  const tx = buildTx(opts);
  const withTenant = jest.fn(
    async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ select: tx.select }),
  );
  const repo = new PaymentReminderRepository({ withTenant } as never);
  return { repo, ...tx };
};

describe('PaymentReminderRepository.listDueInvoices — offset matching', () => {
  it('includes an invoice due exactly on the "0" (due date) offset', async () => {
    const { repo } = repoWith({
      offsets: [0, 7, 30],
      invoiceRows: [invoiceRow({ dueDate: TODAY })],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(1);
    expect(due[0]!.offsetDays).toBe(0);
  });

  it('includes an invoice exactly 7 days overdue', async () => {
    const { repo } = repoWith({
      offsets: [0, 7, 30],
      invoiceRows: [invoiceRow({ dueDate: addDays(TODAY, -7) })],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(1);
    expect(due[0]!.offsetDays).toBe(7);
  });

  it('excludes an invoice one day off every configured offset', async () => {
    const { repo } = repoWith({
      offsets: [0, 7, 30],
      invoiceRows: [invoiceRow({ dueDate: addDays(TODAY, -1) })],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(0);
  });

  it('honours a tenant-configured offset set instead of the default', async () => {
    const { repo } = repoWith({
      offsets: [3],
      invoiceRows: [invoiceRow({ dueDate: addDays(TODAY, -3) })],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(1);
  });

  it('falls back to the default [0, 7, 30] offsets when the tenant row is missing', async () => {
    const { repo } = repoWith({
      offsets: undefined,
      invoiceRows: [invoiceRow({ dueDate: addDays(TODAY, -30) })],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(1);
  });
});

describe('PaymentReminderRepository.listDueInvoices — outstanding via the aging formula', () => {
  it('excludes an invoice with zero outstanding (fully allocated) even on a matching offset day', async () => {
    const { repo } = repoWith({
      offsets: [0],
      invoiceRows: [invoiceRow({ dueDate: TODAY, totalEtb: '1000.00' })],
      allocationRows: [{ invoiceId: 'inv-1', total: '1000.00' }],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due).toHaveLength(0);
  });

  it('reports the outstanding amount as totalEtb - whtEtb - allocated, formatted to 2dp', async () => {
    const { repo } = repoWith({
      offsets: [0],
      invoiceRows: [
        invoiceRow({ dueDate: TODAY, totalEtb: '1000.00', whtEtb: '20.00' }),
      ],
      allocationRows: [{ invoiceId: 'inv-1', total: '300.00' }],
    });

    const due = await repo.listDueInvoices(TENANT_ID);

    expect(due[0]!.outstandingEtb).toBe('680.00');
  });

  it('skips the allocation query entirely when there are no due-dated invoices', async () => {
    const { repo, select } = repoWith({ offsets: [0], invoiceRows: [] });

    await repo.listDueInvoices(TENANT_ID);

    // tenant offsets + invoices = 2 calls; allocation sums never queried.
    expect(select).toHaveBeenCalledTimes(2);
  });
});
