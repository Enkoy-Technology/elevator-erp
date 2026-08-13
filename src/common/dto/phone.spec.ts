import { IsEthiopianPhoneConstraint } from './phone';

const constraint = new IsEthiopianPhoneConstraint();
// @ts-expect-error validate()'s ValidationArguments param is unused by this constraint.
const check = (value: unknown): boolean => constraint.validate(value);

describe('IsEthiopianPhoneConstraint', () => {
  it('accepts the forms staff actually type', () => {
    expect(check('0911234567')).toBe(true);
    expect(check('+251911234567')).toBe(true);
    expect(check('251911234567')).toBe(true);
    expect(check('0911 234 567')).toBe(true);
    expect(check('091-123-4567')).toBe(true);
  });

  it('rejects a malformed number instead of letting it reach the DB', () => {
    expect(check('0911 2345')).toBe(false);
    expect(check('not-a-phone')).toBe(false);
    // A landline / out-of-range leading digit — see normalizeEthiopianPhone's
    // own doc comment for why only 7/9-leading national numbers are valid.
    expect(check('0111234567')).toBe(false);
  });

  it('passes an empty string through — "left blank", not "malformed"', () => {
    expect(check('')).toBe(true);
    expect(check('   ')).toBe(true);
  });

  it('passes a non-string value through untouched — @IsString() is that job', () => {
    expect(check(undefined)).toBe(true);
    expect(check(12345)).toBe(true);
  });
});
