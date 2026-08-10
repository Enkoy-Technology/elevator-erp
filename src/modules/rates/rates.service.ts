import { Injectable } from '@nestjs/common';

import { RateNotFoundError } from '../../common/exceptions';
import { computeFiscalYear, type FiscalYear } from '../../common/fiscal-year';
import type { RateKind } from '../../database/schema';
import { parseRatePayload } from './rate-payloads';
import { RatesRepository, type RateVersionRecord } from './rates.repository';

// Binding interface for downstream tasks: the resolved rate version without
// repository-only fields (source, createdAt).
export type RateVersion = Pick<
  RateVersionRecord,
  'id' | 'kind' | 'validFrom' | 'validTo' | 'payload'
>;

// Re-exported so existing imports of `RateNotFoundError` from this module
// keep working; the class itself now lives in common/exceptions (1.3) so it
// can extend DomainError and map to 404 without a controller try/catch.
export { RateNotFoundError };

export type { FiscalYear };

@Injectable()
export class RatesService {
  constructor(private readonly ratesRepo: RatesRepository) {}

  async resolve(kind: RateKind, onDate: string): Promise<RateVersion> {
    const version = await this.ratesRepo.findActive(kind, onDate);
    if (!version) {
      throw new RateNotFoundError(kind, onDate);
    }
    return version;
  }

  /** Closes the currently-open version of `kind` and opens a new one. */
  async create(
    kind: RateKind,
    validFrom: string,
    payload: Record<string, unknown>,
    source: string,
  ): Promise<RateVersion> {
    const parsed = parseRatePayload(kind, payload);
    return this.ratesRepo.rotate({ kind, validFrom, payload: parsed, source });
  }

  /**
   * Ethiopian fiscal year runs from `boundary` (MM-DD, e.g. '07-08' = 8
   * Hamle / 8 July) through the day before that boundary the next year.
   * Pure date arithmetic — no external date library.
   */
  fiscalYearFor(dateStr: string, boundary: string): FiscalYear {
    return computeFiscalYear(dateStr, boundary);
  }
}
