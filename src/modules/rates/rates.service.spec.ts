import { Test } from '@nestjs/testing';
import { RatesService } from './rates.service';
import { RatesRepository } from './rates.repository';

describe('RatesService', () => {
  let service: RatesService;
  const repo = {
    findActive: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    rotate: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RatesService, { provide: RatesRepository, useValue: repo }],
    }).compile();
    service = module.get(RatesService);
    jest.resetAllMocks();
  });

  it('resolves the version whose window contains the date', async () => {
    repo.findActive.mockResolvedValue({
      id: 'v2', kind: 'VAT', validFrom: '2024-08-21', validTo: null,
      payload: { percent: '15' },
    });
    const version = await service.resolve('VAT', '2026-08-08');
    expect(version.id).toBe('v2');
    expect(repo.findActive).toHaveBeenCalledWith('VAT', '2026-08-08');
  });

  it('throws RateNotFoundError when no version covers the date', async () => {
    repo.findActive.mockResolvedValue(undefined);
    await expect(service.resolve('VAT', '1990-01-01')).rejects.toThrow(
      'No VAT rate version covers 1990-01-01',
    );
  });

  it('computes the Ethiopian fiscal year for a date after 8 July', () => {
    expect(service.fiscalYearFor('2026-08-08', '07-08')).toEqual({
      start: '2026-07-08', end: '2027-07-07', label: 'FY2026/27',
    });
  });

  it('computes the fiscal year for a date before 8 July', () => {
    expect(service.fiscalYearFor('2026-05-01', '07-08')).toEqual({
      start: '2025-07-08', end: '2026-07-07', label: 'FY2025/26',
    });
  });

  // Boundary case: the boundary date itself starts the new fiscal year.
  it('treats the boundary date itself as the start of the new fiscal year', () => {
    expect(service.fiscalYearFor('2026-07-08', '07-08')).toEqual({
      start: '2026-07-08', end: '2027-07-07', label: 'FY2026/27',
    });
  });

  // Boundary case: the day before the boundary is the last day of the prior
  // fiscal year.
  it('treats the day before the boundary as the end of the prior fiscal year', () => {
    expect(service.fiscalYearFor('2026-07-07', '07-08')).toEqual({
      start: '2025-07-08', end: '2026-07-07', label: 'FY2025/26',
    });
  });

  // Leap-adjacent case: a '03-01' boundary means the prior fiscal year ends
  // the day before 1 March. In a leap year that's 29 February — real Date
  // arithmetic (not a fixed-year approximation) must get this right.
  it('ends the fiscal year on 29 February when the boundary is 1 March in a leap year', () => {
    expect(service.fiscalYearFor('2024-02-29', '03-01')).toEqual({
      start: '2023-03-01', end: '2024-02-29', label: 'FY2023/24',
    });
  });

  it('create() delegates rotation to the repository', async () => {
    repo.rotate.mockResolvedValue({ id: 'v3', kind: 'VAT', validFrom: '2026-08-08', validTo: null, payload: { percent: '16' } });
    const result = await service.create('VAT', '2026-08-08', { percent: '16' }, 'VAT Proclamation X');
    expect(repo.rotate).toHaveBeenCalledWith({
      kind: 'VAT',
      validFrom: '2026-08-08',
      payload: { percent: '16' },
      source: 'VAT Proclamation X',
    });
    expect(result.id).toBe('v3');
  });

  it('create() rejects a payload that does not match the kind schema, without hitting the repository', async () => {
    await expect(
      service.create('VAT', '2026-08-08', { percent: 'not-a-number' }, 'VAT Proclamation X'),
    ).rejects.toThrow(/Invalid payload for rate kind VAT/);
    expect(repo.rotate).not.toHaveBeenCalled();
  });
});
