import { ratePayloadSchemaFor } from './rate-payloads';
import { RATE_SEEDS, seedRates } from './seed-rates';
import { RatesRepository, type RateVersionInsert } from './rates.repository';

describe('seedRates', () => {
  const repo = {
    findOpenKinds: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('creates every rate kind when none has an open version', async () => {
    repo.findOpenKinds.mockResolvedValue([]);

    await seedRates(repo as unknown as RatesRepository);

    expect(repo.create).toHaveBeenCalledTimes(RATE_SEEDS.length);
    for (const seed of RATE_SEEDS) {
      expect(repo.create).toHaveBeenCalledWith(seed);
    }
  });

  it('skips kinds that already have an open version', async () => {
    repo.findOpenKinds.mockResolvedValue(['VAT', 'PENSION_EMPLOYEE']);

    await seedRates(repo as unknown as RatesRepository);

    expect(repo.create).toHaveBeenCalledTimes(RATE_SEEDS.length - 2);
    const createdKinds = (
      repo.create.mock.calls as [RateVersionInsert][]
    ).map(([values]) => values.kind);
    expect(createdKinds).not.toContain('VAT');
    expect(createdKinds).not.toContain('PENSION_EMPLOYEE');
  });

  it('is a no-op once every kind already has an open version', async () => {
    repo.findOpenKinds.mockResolvedValue(RATE_SEEDS.map((seed) => seed.kind));

    await seedRates(repo as unknown as RatesRepository);

    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('RATE_SEEDS payloads', () => {
  // The seeds are the proof: if a seed's payload doesn't match its kind's
  // zod schema, the schema is wrong (or the seed is) — either way, POST
  // /rates would reject the government's own current rates.
  it.each(RATE_SEEDS.map((seed) => [seed.kind, seed] as const))(
    '%s payload parses against its schema',
    (kind, seed) => {
      const result = ratePayloadSchemaFor(kind).safeParse(seed.payload);
      expect(result.success).toBe(true);
    },
  );
});
