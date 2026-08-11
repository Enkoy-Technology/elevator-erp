import { z } from 'zod';

import { InvalidRateTransitionError } from '../../common/exceptions';
import type { RateKind } from '../../database/schema';

// Decimal string as stored throughout: e.g. '15', '3.5', '20000'. Never a
// JS number — money/rate math stays on strings until it reaches Decimal.
const decimalString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string, e.g. "15" or "3.5"');

const percentPayload = z.strictObject({ percent: decimalString });

const withholdingPayload = z.strictObject({
  percent: decimalString,
  thresholdEtb: decimalString,
});

// R7 (decisions doc §8.5): WHT_NO_TIN's threshold is an OPEN QUESTION —
// unlike WHT_GOODS/WHT_SERVICES, Ethiopian tax law does not give a
// documented de-minimis exemption for the no-TIN 30% rate, and guessing at
// one is worse than not applying one (see seed-rates.ts's own comment on
// the seeded payload, and wht-decision.ts's computeWithholding). So
// `thresholdEtb` is OPTIONAL here rather than required — the day a tax
// practitioner confirms a real number, adding it is a POST /rates data
// change, never a code change (this project's rule: rates are data).
const noTinWithholdingPayload = z.strictObject({
  percent: decimalString,
  thresholdEtb: decimalString.optional(),
});

const pensionPayload = z.strictObject({
  percent: decimalString,
  base: z.literal('BASIC'),
});

// Half-open intervals: `from` inclusive, `to` exclusive, so a boundary
// salary (e.g. exactly 2000.00) lands in exactly one band. `to: null` marks
// the top (open-ended) band. See seed-rates.ts for the convention in full.
const payeBand = z.strictObject({
  from: decimalString,
  to: decimalString.nullable(),
  ratePercent: decimalString,
});

const payeBandsPayload = z.strictObject({
  bands: z.array(payeBand).nonempty(),
});

const RATE_PAYLOAD_SCHEMAS: Record<RateKind, z.ZodType> = {
  VAT: percentPayload,
  WHT_GOODS: withholdingPayload,
  WHT_SERVICES: withholdingPayload,
  WHT_NO_TIN: noTinWithholdingPayload,
  PAYE_BANDS: payeBandsPayload,
  PENSION_EMPLOYEE: pensionPayload,
  PENSION_EMPLOYER: pensionPayload,
};

/** Zod schema for the given rate kind's payload shape — exported for tests (seed-rates.spec.ts). */
export const ratePayloadSchemaFor = (kind: RateKind): z.ZodType =>
  RATE_PAYLOAD_SCHEMAS[kind];

/** Validates `payload` against its kind's schema; throws InvalidRateTransitionError (400) on failure. */
export const parseRatePayload = (
  kind: RateKind,
  payload: Record<string, unknown>,
): Record<string, unknown> => {
  const result = RATE_PAYLOAD_SCHEMAS[kind].safeParse(payload);
  if (!result.success) {
    throw new InvalidRateTransitionError(
      `Invalid payload for rate kind ${kind}: ${result.error.message}`,
    );
  }
  return result.data as Record<string, unknown>;
};
