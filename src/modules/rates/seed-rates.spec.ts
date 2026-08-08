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
