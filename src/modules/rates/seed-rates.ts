/* eslint-disable no-console */
import type { RateVersionInsert } from './rates.repository';
import { RatesRepository } from './rates.repository';

const INCOME_TAX_AMENDMENT_UNVERIFIED =
  '2025 Income Tax (Amendment) — UNVERIFIED-current';

// Pension rate/base is a long-standing rule, not part of the 2025 income tax
// amendment — but no proclamation number has been verified against the
// gazette yet (decisions doc: do not assert unverified proclamation
// numbers), so it carries the same caveat.
const PENSION_UNVERIFIED = 'Pension Proclamation — UNVERIFIED-current';

// Current Ethiopian statutory rates (Task 1.2). One row per rate kind — see
// task-1.2-brief.md's controller addendum for the sourcing of each value.
export const RATE_SEEDS: RateVersionInsert[] = [
  {
    kind: 'VAT',
    validFrom: '2024-08-21',
    payload: { percent: '15' },
    source: 'VAT Proclamation 1341/2024',
  },
  {
    kind: 'WHT_GOODS',
    validFrom: '2025-07-08',
    payload: { percent: '3', thresholdEtb: '20000' },
    source: INCOME_TAX_AMENDMENT_UNVERIFIED,
  },
  {
    kind: 'WHT_SERVICES',
    validFrom: '2025-07-08',
    payload: { percent: '3', thresholdEtb: '10000' },
    source: INCOME_TAX_AMENDMENT_UNVERIFIED,
  },
  {
    kind: 'WHT_NO_TIN',
    validFrom: '2025-07-08',
    payload: { percent: '30' },
    source: INCOME_TAX_AMENDMENT_UNVERIFIED,
  },
  {
    kind: 'PAYE_BANDS',
    validFrom: '2025-07-08',
    payload: {
      // Half-open intervals: `from` inclusive, `to` exclusive, so a
      // fractional salary exactly on a boundary (e.g. 2000.50) lands in
      // exactly one band. `to: null` marks the open-ended top band.
      bands: [
        { from: '0', to: '2000', ratePercent: '0' },
        { from: '2000', to: '4000', ratePercent: '15' },
        { from: '4000', to: '7000', ratePercent: '20' },
        { from: '7000', to: '10000', ratePercent: '25' },
        { from: '10000', to: '14000', ratePercent: '30' },
        { from: '14000', to: null, ratePercent: '35' },
      ],
    },
    source: INCOME_TAX_AMENDMENT_UNVERIFIED,
  },
  {
    kind: 'PENSION_EMPLOYEE',
    validFrom: '2025-07-08',
    payload: { percent: '7', base: 'BASIC' },
    source: PENSION_UNVERIFIED,
  },
  {
    kind: 'PENSION_EMPLOYER',
    validFrom: '2025-07-08',
    payload: { percent: '11', base: 'BASIC' },
    source: PENSION_UNVERIFIED,
  },
];

/**
 * Seeds current statutory rates — idempotent: skips any kind that already
 * has an open (valid_to IS NULL) version, so re-running inserts nothing.
 * Not demo data; safe (and intended) to run in every environment.
 */
export const seedRates = async (repo: RatesRepository): Promise<void> => {
  const openKinds = new Set(await repo.findOpenKinds());
  const toSeed = RATE_SEEDS.filter((seed) => !openKinds.has(seed.kind));

  for (const seed of toSeed) {
    await repo.create(seed);
    console.log(`Seeded rate ${seed.kind} (valid from ${seed.validFrom})`);
  }

  if (toSeed.length === 0) {
    console.log('All rate kinds already have an open version, skipping.');
  }
};
