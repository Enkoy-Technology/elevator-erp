import { Injectable } from '@nestjs/common';

import { RateNotFoundError } from '../../common/exceptions';
import type { RateKind } from '../../database/schema';
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

export interface FiscalYear {
  start: string;
  end: string;
  label: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

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
    payload: unknown,
    source: string,
  ): Promise<RateVersion> {
    return this.ratesRepo.rotate({ kind, validFrom, payload, source });
  }

  /**
   * Ethiopian fiscal year runs from `boundary` (MM-DD, e.g. '07-08' = 8
   * Hamle / 8 July) through the day before that boundary the next year.
   * Pure date arithmetic — no external date library.
   */
  fiscalYearFor(dateStr: string, boundary: string): FiscalYear {
    const [monthStr, dayStr] = boundary.split('-');
    const boundaryMonth = Number(monthStr);
    const boundaryDay = Number(dayStr);
    const year = Number(dateStr.slice(0, 4));
    const dateMonthDay = dateStr.slice(5);
    const startYear = dateMonthDay >= boundary ? year : year - 1;

    const endExclusive = new Date(
      Date.UTC(startYear + 1, boundaryMonth - 1, boundaryDay),
    );
    endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);

    return {
      start: `${startYear}-${boundary}`,
      end: formatDate(endExclusive),
      label: `FY${startYear}/${pad2((startYear + 1) % 100)}`,
    };
  }
}
