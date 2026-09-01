import type { Database } from '../../database/database.types';
import {
  COMPONENT_SPECIFICATION_SEEDS,
  DOCUMENT_BOILERPLATE_SEEDS,
  seedDocumentContent,
} from './seed-document-content';

const TENANT_ID = '22222222-2222-4222-8222-222222222222';

type Row = Record<string, unknown>;

interface InsertChain {
  values: jest.Mock;
  onConflictDoNothing: jest.Mock;
  returning: jest.Mock;
}

const insertChain = (rows: Row[]): InsertChain => {
  const chain = {} as InsertChain;
  chain.values = jest.fn(() => chain);
  chain.onConflictDoNothing = jest.fn(() => chain);
  chain.returning = jest.fn(() => Promise.resolve(rows));
  return chain;
};

const dbWith = (rows: Row[]) => {
  const chain = insertChain(rows);
  const execute = jest.fn((_query: unknown) => Promise.resolve());
  const tx = { execute, insert: jest.fn(() => chain) };
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Database;
  return { db, chain, execute, tx };
};

describe('Shining Star seed content', () => {
  it('carries all eight boilerplate sections, keyed uniquely', () => {
    expect(DOCUMENT_BOILERPLATE_SEEDS).toHaveLength(8);
    const keys = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.sectionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'standards',
      'cabin_finishing',
      'machine_control',
      'special_operation',
      'operation_panel',
      'rescue_device',
      'shaft_information',
      'supply_includes',
    ]);
  });

  it('carries all twenty component rows, each with a brand', () => {
    expect(COMPONENT_SPECIFICATION_SEEDS).toHaveLength(20);
    for (const seed of COMPONENT_SPECIFICATION_SEEDS) {
      expect(seed.componentName.length).toBeGreaterThan(0);
      expect(seed.brand.length).toBeGreaterThan(0);
    }
  });

  it('normalises the encoder row, whose source table put a country in the Brand column', () => {
    const encoder = COMPONENT_SPECIFICATION_SEEDS.find(
      (seed) => seed.componentName === 'Encoder',
    );
    expect(encoder).toEqual({
      componentName: 'Encoder',
      brand: 'HEIDENHAIN',
      remark: 'Germany, ERN1387',
    });
  });

  // The whole reason these tables exist: the client's pasted pages contradict
  // their own spec table. Both contradicted values are per-quote fields, so
  // neither may be frozen into shared boilerplate. If someone later
  // "completes" the transcription from the source PDF, these fail.
  it('states no control system — that is per-quote, and their pages disagree', () => {
    const bodies = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.body).join('\n');
    expect(bodies).not.toMatch(/duplex/i);
    expect(bodies).not.toMatch(/simplex/i);
  });

  it('states no supply voltage — also per-quote, and their pages disagree', () => {
    const bodies = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.body).join('\n');
    expect(bodies).not.toMatch(/\d{3}\s*\/?\s*\d*\s*V\b/i);
  });

  it('keeps the Standards bullets as bullet lines', () => {
    const standards = DOCUMENT_BOILERPLATE_SEEDS[0];
    const bullets = standards?.body
      .split('\n')
      .filter((line) => line.startsWith('- '));
    expect(bullets).toHaveLength(4);
  });
});

describe('seedDocumentContent', () => {
  it('numbers both tables from the array order and never overwrites edited text', async () => {
    const { db, chain } = dbWith([]);

    await seedDocumentContent(db, TENANT_ID);

    const [sectionValues] = chain.values.mock.calls[0] as unknown as [Row[]];
    expect(sectionValues.map((row) => row.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sectionValues.every((row) => row.tenantId === TENANT_ID)).toBe(true);

    const [componentValues] = chain.values.mock.calls[1] as unknown as [Row[]];
    expect(componentValues.map((row) => row.sequence)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );

    // Idempotency is ON CONFLICT DO NOTHING, not DO UPDATE: re-running a
    // deploy must not revert a section the tenant has since reworded.
    expect(chain.onConflictDoNothing).toHaveBeenCalledTimes(2);
  });

  it('opts the transaction into admin_bypass before writing', async () => {
    // Both tables are FORCE ROW LEVEL SECURITY. Without this the seed inserts
    // zero rows on a non-superuser owner connection and reports success.
    const { db, execute } = dbWith([]);

    await seedDocumentContent(db, TENANT_ID);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toBeDefined();
  });

  it('reports how many rows it actually inserted', async () => {
    const { db } = dbWith([{ id: 'x' }, { id: 'y' }]);

    await expect(seedDocumentContent(db, TENANT_ID)).resolves.toEqual({
      boilerplate: 2,
      components: 2,
    });
  });
});
