/**
 * The one client-side ETB money formatter (web/). API money fields are
 * `numeric(14,2)` decimal strings — `Number()` on one silently loses
 * precision past 2^53 and invites float rounding error well before that, so
 * every helper here works on the string / BigInt-cents representation
 * instead and never calls `Number()` on a money value.
 *
 * DISPLAY ONLY: `sumEtb`/`lineTotalEtb` exist to preview a running total in
 * a create form. The server always recomputes the real total from the same
 * line inputs and its number is the one that gets stored — never send a
 * client-computed total back to the API.
 */

const MONEY_SHAPE_RE = /^-?\d+(\.\d{1,2})?$/;

/** Money string -> integer cents, exact. */
const toCents = (value: string): bigint => {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fracPart = ''] = unsigned.split('.');
  const cents =
    BigInt(wholePart || '0') * 100n + BigInt((fracPart + '00').slice(0, 2) || '0');
  return negative ? -cents : cents;
};

/** Integer cents -> money string, exact. */
const fromCents = (cents: bigint): string => {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`;
};

const GROUP_RE = /\B(?=(\d{3})+(?!\d))/g;

/** '1234.5' -> '1,234.50 ETB'. Falls back to a plain suffix on anything that
 *  doesn't parse as money rather than throwing on unexpected server data. */
export const formatEtb = (value: string): string => {
  if (!MONEY_SHAPE_RE.test(value.trim())) {
    return `${value} ETB`;
  }
  const [whole, frac] = fromCents(toCents(value)).split('.');
  const negative = whole.startsWith('-');
  const grouped = (negative ? whole.slice(1) : whole).replace(GROUP_RE, ',');
  return `${negative ? '-' : ''}${grouped}.${frac} ETB`;
};

/** True for any zero representation ('0', '0.00', '-0.00', ...). */
export const isZeroEtb = (value: string): boolean => toCents(value) === 0n;

/** Exact sum of money strings, for a display-only running total. */
export const sumEtb = (values: readonly string[]): string =>
  fromCents(values.reduce((total, v) => total + toCents(v), 0n));

/** Exact a - b. */
export const subtractEtb = (a: string, b: string): string =>
  fromCents(toCents(a) - toCents(b));

/** True for a strictly positive money string. */
export const isPositiveEtb = (value: string): boolean => toCents(value) > 0n;

/** Exact quantity (<=3dp) x unit price (<=2dp), rounded half-up to 2dp — the
 *  same rounding point the server's computeLineTotal (invoice-money.ts)
 *  uses — for a display-only line-item preview. */
export const lineTotalEtb = (quantity: string, unitPriceEtb: string): string => {
  const [qWhole, qFrac = ''] = quantity.trim().split('.');
  const qMilli = BigInt(qWhole || '0') * 1000n + BigInt((qFrac + '000').slice(0, 3) || '0');
  const priceCents = toCents(unitPriceEtb);
  // Scaled by 1000 (qty) * 100 (price) = 100000 per ETB; drop the last 3
  // digits (thousandths of a cent) with a half-up round on the remainder.
  const productMicro = qMilli * priceCents;
  const wholeCents = productMicro / 1000n;
  const remainder = productMicro % 1000n;
  const roundedCents = remainder * 2n >= 1000n ? wholeCents + 1n : wholeCents;
  return fromCents(roundedCents);
};

/**
 * Thousands separators for a plain quantity — a capacity in kg, a dimension
 * in mm, a count. NOT for money: `formatEtb` owns that, because money also
 * carries the currency suffix and a fixed 2 decimals.
 *
 * Kept here beside formatEtb rather than in its own module so there is one
 * obvious place to look for "how do we print a number", which is what stops
 * the next person hand-rolling a third one.
 */
export const formatNumber = (
  value: number | string | null | undefined,
  { decimals }: { decimals?: number } = {},
): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    // Server data we don't recognise is shown as-is rather than as "NaN".
    return String(value);
  }
  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? (Number.isInteger(parsed) ? 0 : 2),
  });
};
