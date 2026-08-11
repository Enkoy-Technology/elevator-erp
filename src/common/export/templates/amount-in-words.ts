import { Decimal } from 'decimal.js';

// English-only by design — see docs/planning (no-Amharic-UI decision):
// Ethiopian business/accounting is conducted in English, and a spelled-out
// Amharic number-words implementation is a real (and separately scoped)
// piece of work, not a one-line addition to this file. Do not add an
// Amharic branch here without that decision being revisited.

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// Covers up to 999 trillion — numeric(14,2) (the widest money column in the
// schema) has at most 12 integer digits, well inside this range.
const SCALES = ['', 'thousand', 'million', 'billion', 'trillion'];

/** n in [0, 999] -> lowercase words, no leading/trailing whitespace. */
function threeDigitsToWords(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) {
    words.push(`${ONES[hundreds]} hundred`);
  }
  if (rest > 0) {
    if (rest < 20) {
      // Indices below are guaranteed in-range by the surrounding bounds
      // checks (rest < 20, tens/ones from a % 100 / % 10 split) —
      // noUncheckedIndexedAccess can't see that, hence the assertions.
      words.push(ONES[rest]!);
    } else {
      const tens = Math.floor(rest / 10);
      const ones = rest % 10;
      words.push(ones > 0 ? `${TENS[tens]!}-${ONES[ones]!}` : TENS[tens]!);
    }
  }
  return words.join(' ');
}

/** Non-negative integer -> lowercase words ("zero" for 0). */
function integerToWords(n: number): string {
  if (n === 0) {
    return 'zero';
  }
  const groups: number[] = [];
  let remaining = n;
  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) {
      continue;
    }
    const groupWords = threeDigitsToWords(groups[i]!);
    parts.push(SCALES[i] ? `${groupWords} ${SCALES[i]}` : groupWords);
  }
  return parts.join(' ');
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Renders a non-negative ETB decimal string as check-writing style English
 * words: "One hundred twelve Birr and 00/100". Cents are always digits
 * ("NN/100"), never spelled out — matches standard cheque convention and
 * keeps this from needing its own recursive case for the fractional part.
 *
 * English-only (see the file's top comment). Non-negative only: the one
 * caller today (receipt.template.ts) handles a reversal's negative amount
 * itself (a "Negative " prefix on the magnitude's words) rather than this
 * helper growing sign-handling it would otherwise never exercise.
 *
 * Throws on empty/non-numeric/negative input — same "never silently
 * misstate money" stance as formatEtb, since this also renders on a
 * customer-facing document.
 */
export function amountInWords(value: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`amountInWords: value is required, got ${JSON.stringify(value)}`);
  }
  let amount: Decimal;
  try {
    amount = new Decimal(trimmed);
  } catch {
    throw new Error(`amountInWords: not a valid decimal string: ${JSON.stringify(value)}`);
  }
  if (amount.isNegative()) {
    throw new Error(`amountInWords: expects a non-negative amount, got ${JSON.stringify(value)}`);
  }

  const rounded = amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const [wholeStr, centsStr] = rounded.toFixed(2).split('.');
  // Number() is safe here: numeric(14,2)'s 12-digit integer part is far
  // inside Number.MAX_SAFE_INTEGER, and only the integer part goes through
  // Number — the cents string is used as-is, never parsed.
  const words = capitalize(integerToWords(Number(wholeStr)));
  return `${words} Birr and ${centsStr}/100`;
}
