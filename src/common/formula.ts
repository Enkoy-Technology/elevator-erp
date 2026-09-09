import Decimal from 'decimal.js';

/**
 * A small arithmetic language for the price formula the client types under
 * Settings, evaluated with decimal.js so money never passes through a float.
 *
 *   base + (N - 10) * 80,000 + (C - 630kg) * 1000
 *
 * Supports + - * / and parentheses, unary minus, thousands separators in
 * numbers, unit suffixes glued to a number (630kg, 2400mm), implicit
 * multiplication by juxtaposition ("(C-630)1000"), and the functions
 * max(a, b…), min(a, b…), round(x), floor(x), ceil(x). Identifiers are
 * case-insensitive and "base price" (two words) reads as `base`.
 *
 * No `eval`, no `Function`: the input is the client's, and it is parsed,
 * not executed.
 */

/** What a formula may refer to. Every value is a decimal string or number. */
export interface FormulaScope {
  /** The product's base price. */
  base: Decimal.Value;
  /** Stops (floors served). */
  N: Decimal.Value;
  /** Rated capacity, kg. */
  C: Decimal.Value;
  /** The product's own per-stop rate. */
  perStop: Decimal.Value;
  /** The product's own per-kg rate. */
  perKg: Decimal.Value;
}

const ALIASES: Record<string, keyof FormulaScope> = {
  base: 'base',
  baseprice: 'base',
  base_price: 'base',
  b: 'base',
  n: 'N',
  stops: 'N',
  floors: 'N',
  c: 'C',
  capacity: 'C',
  kg: 'C',
  load: 'C',
  perstop: 'perStop',
  per_stop: 'perStop',
  ratestop: 'perStop',
  perkg: 'perKg',
  per_kg: 'perKg',
  ratekg: 'perKg',
};

const FUNCTIONS: Record<string, (args: Decimal[]) => Decimal> = {
  max: (args) => {
    if (args.length === 0)
      throw new FormulaError('max() needs at least one value');
    return Decimal.max(...args);
  },
  min: (args) => {
    if (args.length === 0)
      throw new FormulaError('min() needs at least one value');
    return Decimal.min(...args);
  },
  round: ([x]) =>
    (x ?? new Decimal(0)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP),
  floor: ([x]) => (x ?? new Decimal(0)).floor(),
  ceil: ([x]) => (x ?? new Decimal(0)).ceil(),
  abs: ([x]) => (x ?? new Decimal(0)).abs(),
};

export class FormulaError extends Error {}

/** Matches the DTO's cap; keeps the recursive parser safe on its own. */
export const MAX_FORMULA_LENGTH = 500;

type Token =
  | { kind: 'num'; value: Decimal }
  | { kind: 'id'; name: string }
  | { kind: 'op'; value: string };

const UNIT_SUFFIX = /^(kg|mm|m|etb|birr)/i;

const SYMBOLS: Record<string, string> = {
  '×': '*',
  '÷': '/',
  '−': '-',
  '–': '-',
  '—': '-',
};

const tokenize = (source: string): Token[] => {
  // "base price" is one identifier; do it before anything else.
  const text = source.replace(/base\s+price/gi, 'base');
  const tokens: Token[] = [];
  // Inside a function's argument list a comma separates arguments, never
  // digit groups: min(5,100) is two values. Outside, 80,000 is one number.
  const parens: ('fn' | 'group')[] = [];
  const inArgs = (): boolean => parens[parens.length - 1] === 'fn';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      // digits with optional thousands commas and one decimal point. A
      // comma is a thousands separator only when exactly three digits
      // follow it — otherwise it separates function arguments: max(0, N).
      while (j < text.length) {
        const c = text[j]!;
        if (/[0-9.]/.test(c)) {
          j++;
        } else if (
          c === ',' &&
          !inArgs() &&
          /^\d{3}(?!\d)/.test(text.slice(j + 1))
        ) {
          j++;
        } else {
          break;
        }
      }
      const raw = text.slice(i, j).replace(/,/g, '');
      if (!/^\d*\.?\d+$|^\d+\.?\d*$/.test(raw)) {
        throw new FormulaError(`Not a number: "${text.slice(i, j)}"`);
      }
      tokens.push({ kind: 'num', value: new Decimal(raw) });
      i = j;
      // a unit glued to the number is noise: 630kg, 2400mm
      const unit = UNIT_SUFFIX.exec(text.slice(i));
      if (unit && !/[a-z0-9_]/i.test(text[i + unit[0].length] ?? '')) {
        i += unit[0].length;
      }
      continue;
    }
    if (/[a-z_]/i.test(ch)) {
      let j = i;
      while (j < text.length && /[a-z0-9_]/i.test(text[j]!)) j++;
      tokens.push({ kind: 'id', name: text.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/(),'.includes(ch)) {
      if (ch === '(') {
        const prev = tokens[tokens.length - 1];
        parens.push(
          prev?.kind === 'id' && prev.name.toLowerCase() in FUNCTIONS
            ? 'fn'
            : 'group',
        );
      } else if (ch === ')') {
        parens.pop();
      }
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    // The signs the help text and the docs print.
    const symbol = SYMBOLS[ch];
    if (symbol) {
      tokens.push({ kind: 'op', value: symbol });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`);
  }
  return tokens;
};

/**
 * Recursive descent over the token list. Each level returns a Decimal, so
 * the parse and the evaluation are one pass — a formula is a few dozen
 * tokens, never worth an AST.
 */
class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly scope: FormulaScope,
  ) {}

  parse(): Decimal {
    if (this.tokens.length === 0) {
      throw new FormulaError('The formula is empty');
    }
    const value = this.expression();
    if (this.pos < this.tokens.length) {
      throw new FormulaError(
        `Unexpected "${this.describe(this.tokens[this.pos]!)}"`,
      );
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t?.kind === 'op' && t.value === value;
  }

  private expression(): Decimal {
    let left = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.tokens[this.pos++] as { value: string }).value;
      const right = this.term();
      left = op === '+' ? left.plus(right) : left.minus(right);
    }
    return left;
  }

  private term(): Decimal {
    let left = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const op = (this.tokens[this.pos++] as { value: string }).value;
        const right = this.unary();
        if (op === '/' && right.isZero()) {
          throw new FormulaError('Division by zero');
        }
        left = op === '*' ? left.mul(right) : left.div(right);
        continue;
      }
      // Implicit multiplication: "(C - 630) 1000", "2 N", ") ("
      const next = this.peek();
      if (
        next &&
        (next.kind === 'num' ||
          next.kind === 'id' ||
          (next.kind === 'op' && next.value === '('))
      ) {
        left = left.mul(this.unary());
        continue;
      }
      return left;
    }
  }

  private unary(): Decimal {
    if (this.isOp('-')) {
      this.pos++;
      return this.unary().neg();
    }
    if (this.isOp('+')) {
      this.pos++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Decimal {
    const token = this.tokens[this.pos++];
    if (!token) {
      throw new FormulaError('The formula ends too early');
    }
    if (token.kind === 'num') {
      return token.value;
    }
    if (token.kind === 'op' && token.value === '(') {
      const value = this.expression();
      if (!this.isOp(')')) {
        throw new FormulaError('Missing ")"');
      }
      this.pos++;
      return value;
    }
    if (token.kind === 'id') {
      const lower = token.name.toLowerCase();
      const fn = FUNCTIONS[lower];
      // A name before "(" is a call only for a known function; "N (C - 630)"
      // is the variable N times the bracket.
      if (fn && this.isOp('(')) {
        this.pos++;
        const args: Decimal[] = [];
        if (!this.isOp(')')) {
          args.push(this.expression());
          while (this.isOp(',')) {
            this.pos++;
            args.push(this.expression());
          }
        }
        if (!this.isOp(')')) {
          throw new FormulaError(`Missing ")" after ${token.name}(`);
        }
        this.pos++;
        return fn(args);
      }
      const key = ALIASES[lower];
      if (!key) {
        throw new FormulaError(
          `Unknown name "${token.name}". Use base, N (stops), C (capacity kg), perStop or perKg.`,
        );
      }
      return new Decimal(this.scope[key]);
    }
    throw new FormulaError(`Unexpected "${this.describe(token)}"`);
  }

  private describe(token: Token): string {
    return token.kind === 'num'
      ? token.value.toString()
      : token.kind === 'id'
        ? token.name
        : token.value;
  }
}

/** Evaluate `formula` for `scope`. Throws FormulaError with a message a person can act on. */
export const evaluateFormula = (
  formula: string,
  scope: FormulaScope,
): Decimal => {
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(
      `The formula is longer than ${MAX_FORMULA_LENGTH} characters`,
    );
  }
  return new Parser(tokenize(formula), scope).parse();
};

/** Well inside numeric(14,2); a list price past this is a typo, not a lift. */
const MAX_PRICE = new Decimal('1e12');

/**
 * The points a formula is tried at before it is saved: the reference
 * machine (the breakdown evaluates every line at C = 630), a small and a
 * large lift, and a flat product with both rates at zero — so a division
 * that only fails at one of them is refused here, not on the next quotation.
 */
const PROBE_SCOPES: readonly FormulaScope[] = [
  { base: '7000000', N: 12, C: 1000, perStop: '80000', perKg: '1000' },
  { base: '7000000', N: 10, C: 630, perStop: '80000', perKg: '1000' },
  { base: '7000000', N: 2, C: 320, perStop: '80000', perKg: '1000' },
  { base: '12000000', N: 64, C: 5000, perStop: '80000', perKg: '1000' },
  { base: '6000000', N: 10, C: 630, perStop: '0', perKg: '0' },
];

/** Parse-and-evaluate against sample lifts; the error message if any fails, else null. */
export const formulaProblem = (formula: string): string | null => {
  try {
    for (const scope of PROBE_SCOPES) {
      const value = evaluateFormula(formula, scope);
      const at = `at ${String(scope.N)} stops, ${String(scope.C)} kg`;
      if (!value.isFinite()) {
        return `Gives an infinite value ${at}`;
      }
      if (value.isNegative()) {
        return `Gives a negative price (${value.toFixed(2)}) ${at}`;
      }
      if (value.greaterThan(MAX_PRICE)) {
        return `Gives an implausible price ${at}`;
      }
    }
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
};

/**
 * The client's own formula, the starter every tenant begins with:
 * "Base price + (N-10)*80,000 + (C-630kg)*1000". Written with the product's
 * own rates (80,000 and 1,000 on every elevator) so that a flat product —
 * escalator, platform lift, rates 0 — stays flat under the same formula.
 */
export const DEFAULT_PRICING_FORMULA =
  'Base price + (N - 10) * perStop + (C - 630kg) * perKg';
