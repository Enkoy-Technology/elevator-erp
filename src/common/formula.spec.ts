import {
  DEFAULT_PRICING_FORMULA,
  evaluateFormula,
  formulaProblem,
  renderFormula,
} from './formula';

const scope = {
  base: '7000000',
  N: 12,
  C: 1000,
  perStop: '80000',
  perKg: '1000',
  refN: 10,
  refC: 630,
  rise: 33,
};

describe('evaluateFormula', () => {
  it("evaluates the client's starter formula exactly as written", () => {
    // 7,000,000 + 2 × 80,000 + 370 × 1,000
    expect(
      evaluateFormula('Base price+(N-10)*80,000+(C-630Kg)1000', scope).toFixed(
        2,
      ),
    ).toBe('7530000.00');
    expect(evaluateFormula(DEFAULT_PRICING_FORMULA, scope).toFixed(2)).toBe(
      '7530000.00',
    );
  });

  it('does not floor unless the formula says so', () => {
    const small = { ...scope, N: 5, C: 450 };
    expect(evaluateFormula(DEFAULT_PRICING_FORMULA, small).toFixed(2)).toBe(
      '6420000.00',
    );
    expect(
      evaluateFormula(
        'base + max(0, N - 10) * perStop + max(0, C - 630) * perKg',
        small,
      ).toFixed(2),
    ).toBe('7000000.00');
  });

  it('respects precedence, unary minus, implicit multiplication and functions', () => {
    expect(evaluateFormula('2 + 3 * 4', scope).toNumber()).toBe(14);
    expect(evaluateFormula('-(2 + 3) N', scope).toNumber()).toBe(-60);
    expect(evaluateFormula('round(10 / 3)', scope).toNumber()).toBe(3);
    expect(evaluateFormula('min(N, 8) × 2', scope).toNumber()).toBe(16);
    expect(evaluateFormula('STOPS + capacity', scope).toNumber()).toBe(1012);
    expect(
      evaluateFormula(
        '(C - refC) * perKg + (L - refN) * perStop',
        scope,
      ).toNumber(),
    ).toBe(530000);
    expect(
      evaluateFormula('base + (Rise - 6) * 500,000', scope).toNumber(),
    ).toBe(20500000);
  });

  it('is exact in decimals', () => {
    expect(evaluateFormula('0.1 + 0.2', scope).toString()).toBe('0.3');
  });

  it('names the problem instead of throwing at quotation time', () => {
    expect(formulaProblem(DEFAULT_PRICING_FORMULA)).toBeNull();
    expect(formulaProblem('')).toMatch(/empty/);
    expect(formulaProblem('base + (N - 10')).toMatch(/\)/);
    expect(formulaProblem('base + price')).toMatch(/Unknown name "price"/);
    expect(formulaProblem('base / 0')).toMatch(/zero/);
    expect(formulaProblem('base; drop table')).toMatch(/Unexpected character/);
    expect(formulaProblem('sqrt(N)')).toMatch(/Unknown name "sqrt"/);
  });
});

describe('formulaProblem probes the points a quotation will hit', () => {
  it('refuses a formula that only fails at the reference capacity or on a flat product', () => {
    expect(formulaProblem('base + perKg / (C - 630)')).toMatch(/zero/);
    expect(formulaProblem('base / perStop')).toMatch(/zero/);
  });

  it('refuses negative and implausible prices', () => {
    expect(formulaProblem('base - 99999999999')).toMatch(/negative/);
    expect(formulaProblem('999999999 999999999 999999999')).toMatch(
      /implausible/,
    );
    expect(formulaProblem('max()')).toMatch(/at least one/);
    expect(formulaProblem('b'.repeat(501))).toMatch(/longer than/);
  });
});

describe('tokenizer traps', () => {
  it('keeps argument commas apart from thousands separators', () => {
    expect(evaluateFormula('min(5,100)', scope).toNumber()).toBe(5);
    expect(evaluateFormula('max(0,500) + 80,000', scope).toNumber()).toBe(
      80500,
    );
    expect(evaluateFormula('(N - 10) * 80,000', scope).toNumber()).toBe(160000);
  });

  it('refuses a percent sign instead of silently dropping it', () => {
    expect(formulaProblem('base * 110%')).toMatch(/Unexpected character "%"/);
  });

  it('reads the signs the help text prints', () => {
    expect(
      evaluateFormula('Base price + (N − 10) × perStop ÷ 2', scope).toNumber(),
    ).toBe(7080000);
  });

  it('treats a variable before a bracket as multiplication', () => {
    expect(evaluateFormula('N (C - 630)', scope).toNumber()).toBe(4440);
  });
});

describe('renderFormula', () => {
  it("writes the company formula with a product's figures in, and the whole working with the lift's", () => {
    const product = { perStop: '80000', perKg: '1000', refN: 10, refC: 630 };
    expect(renderFormula(DEFAULT_PRICING_FORMULA, product)).toBe(
      'Base price + (N - 10) * 80,000 + (C - 630) * 1,000',
    );
    expect(
      renderFormula(DEFAULT_PRICING_FORMULA, {
        ...product,
        base: '7000000',
        N: 15,
        C: 800,
      }),
    ).toBe('7,000,000 + (15 - 10) * 80,000 + (800 - 630) * 1,000');
  });

  it('keeps functions, unary minus and implicit multiplication readable', () => {
    expect(renderFormula('base+max(0,N-refN)*perStop', { refN: 2 })).toBe(
      'Base price + max(0, N - 2) * perStop',
    );
    expect(renderFormula('-(C-630kg)1000 + Rise', {})).toBe(
      '-(C - 630) 1,000 + rise',
    );
  });
});
