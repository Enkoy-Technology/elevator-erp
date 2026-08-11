import { NotFarFutureConstraint } from './date';

const constraint = new NotFarFutureConstraint();
// @ts-expect-error validate()'s ValidationArguments param is unused by this constraint.
const check = (value: unknown): boolean => constraint.validate(value);

describe('NotFarFutureConstraint — rejects a date more than one day in the future', () => {
  it('accepts today', () => {
    expect(check(new Date().toISOString())).toBe(true);
  });

  it('accepts tomorrow (exactly one day ahead)', () => {
    expect(check(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())).toBe(true);
  });

  it('rejects next year', () => {
    expect(check(new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString())).toBe(false);
  });

  it('passes through a non-string value untouched — format is @IsISO8601()\'s job', () => {
    expect(check(undefined)).toBe(true);
    expect(check(12345)).toBe(true);
  });

  it('passes through an unparsable string untouched', () => {
    expect(check('not-a-date')).toBe(true);
  });
});
