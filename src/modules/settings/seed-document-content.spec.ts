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
  it('carries all twelve boilerplate sections, keyed uniquely and in print order', () => {
    expect(DOCUMENT_BOILERPLATE_SEEDS).toHaveLength(12);
    const keys = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.sectionKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      'standards',
      'cabin_door_type',
      'landing_door_type',
      'cabin_finishing',
      'machine_control',
      'special_operation',
      'operation_panel',
      'rescue_device',
      'shaft_information',
      'supply_includes',
      'car_finishes',
      'options_functions',
    ]);
  });

  // Their two door rows differ by one word ("single door"); a copy-paste that
  // loses it would print the landing door as a cabin door on every quote.
  it('carries both door types in the client’s own wording', () => {
    const body = (key: string): string | undefined =>
      DOCUMENT_BOILERPLATE_SEEDS.find((seed) => seed.sectionKey === key)?.body;
    expect(body('cabin_door_type')).toBe(
      'Automatic center opening or left/right opening according to existing civil work',
    );
    expect(body('landing_door_type')).toBe(
      'Automatic single door center opening or left/right opening according to existing civil work',
    );
  });

  it('carries the nine car-finish rows as a label: value list', () => {
    const lines = DOCUMENT_BOILERPLATE_SEEDS.find(
      (seed) => seed.sectionKey === 'car_finishes',
    )?.body.split('\n');
    expect(lines?.map((line) => line.split(':')[0])).toEqual([
      'Car wall',
      'Car ceiling',
      'Car bottom',
      'Car door',
      'Handrail',
      'Landing Door',
      'Jamb',
      'COP',
      'HOP',
    ]);
  });

  // The three per-quote options (Access Card, music in the cabin, the lobby
  // LED display) belong to a quotation's own notes, not to every quote.
  it('lists the seven standard options and none of the per-quote ones', () => {
    const options = DOCUMENT_BOILERPLATE_SEEDS.find(
      (seed) => seed.sectionKey === 'options_functions',
    );
    const bullets = options?.body.split('\n') ?? [];
    expect(bullets).toEqual([
      '- VVVF (Variable Voltage Variable Frequency)',
      '- With ARD',
      '- Accessibility EN 81-20 and EN 81-50',
      '- Impact Resistance',
      '- Forced Entry Prevention',
      '- Alarm System',
      '- Emergency Communication',
    ]);
    expect(options?.body).not.toMatch(/access card|music|led display/i);
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
    const bodies = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.body).join(
      '\n',
    );
    expect(bodies).not.toMatch(/duplex/i);
    expect(bodies).not.toMatch(/simplex/i);
  });

  it('states no supply voltage — also per-quote, and their pages disagree', () => {
    const bodies = DOCUMENT_BOILERPLATE_SEEDS.map((seed) => seed.body).join(
      '\n',
    );
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
    expect(sectionValues.map((row) => row.sortOrder)).toEqual(
      Array.from(
        { length: DOCUMENT_BOILERPLATE_SEEDS.length },
        (_, index) => index + 1,
      ),
    );
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
