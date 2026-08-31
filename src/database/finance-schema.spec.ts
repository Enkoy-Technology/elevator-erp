import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';

import {
  bankAccounts,
  bankTransactions,
  expenses,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
} from './schema';

/**
 * Cheap drift guard for the Phase 4 finance tables: every new tenant table
 * must carry the composite (tenant_id, id) PK, and every ETB money column
 * must use the canonical `*Etb` naming (never the legacy quotation-era
 * `taxAmountEtb`/`totalPriceEtb` shape). Catches a copy-paste regression at
 * `pnpm test` time instead of at migration review time.
 */
const TENANT_TABLES: Array<[name: string, table: PgTable]> = [
  ['invoices', invoices],
  ['invoice_lines', invoiceLines],
  ['payments', payments],
  ['payment_allocations', paymentAllocations],
  ['expenses', expenses],
  ['bank_accounts', bankAccounts],
  ['bank_transactions', bankTransactions],
];

const LEGACY_MONEY_NAMES = ['taxAmountEtb', 'totalPriceEtb'];

describe('finance schema drift guard', () => {
  it.each(TENANT_TABLES)(
    '%s has a composite (tenant_id, id) primary key',
    (_name, table) => {
      const { primaryKeys, columns } = getTableConfig(table);
      const tenantIdCol = columns.find((c) => c.name === 'tenant_id');
      const idCol = columns.find((c) => c.name === 'id');
      expect(tenantIdCol).toBeDefined();
      expect(idCol).toBeDefined();

      // Composite PK can be declared either via primaryKey({ columns: [...] })
      // (what every table here uses) or via .primaryKey() on both columns —
      // accept either shape.
      const compositePk = primaryKeys.find(
        (pk) =>
          pk.columns.length === 2 &&
          pk.columns.some((c) => c.name === 'tenant_id') &&
          pk.columns.some((c) => c.name === 'id'),
      );
      const columnLevelPk = tenantIdCol?.primary && idCol?.primary;
      expect(Boolean(compositePk) || Boolean(columnLevelPk)).toBe(true);
    },
  );

  it.each(TENANT_TABLES)(
    '%s uses no legacy money column names',
    (_name, table) => {
      const { columns } = getTableConfig(table);
      const names = columns.map((c) => c.name);
      for (const legacy of LEGACY_MONEY_NAMES) {
        expect(names).not.toContain(legacy);
      }
    },
  );

  it('invoices carries the canonical subtotalEtb/vatEtb/totalEtb trio', () => {
    const { columns } = getTableConfig(invoices);
    const names = columns.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['subtotal_etb', 'vat_etb', 'total_etb']),
    );
  });
});
