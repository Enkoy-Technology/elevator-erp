import { InvalidPhoneNumberError } from './exceptions';
import { normalizeEthiopianPhone } from './phone';

describe('normalizeEthiopianPhone', () => {
  it.each([
    ['0911234567', '+251911234567'],
    ['+251911234567', '+251911234567'],
    ['251911234567', '+251911234567'],
    ['0711234567', '+251711234567'],
    // Spaces and dashes anywhere.
    ['091 123 4567', '+251911234567'],
    ['091-123-4567', '+251911234567'],
    ['+251 91 123 4567', '+251911234567'],
    ['251-91-123-4567', '+251911234567'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeEthiopianPhone(input)).toBe(expected);
  });

  it.each([
    ['', 'empty string'],
    ['abcdefghij', 'letters'],
    ['091123456', 'too short'],
    ['09112345678', 'too long'],
    ['0511234567', 'landline-shaped (5 prefix, not mobile)'],
    ['+1 555 123 4567', 'a US number'],
    ['+251511234567', 'wrong national prefix under the country code'],
    ['0000000000', 'all zeros'],
  ])('rejects %s (%s) as InvalidPhoneNumberError', (input) => {
    expect(() => normalizeEthiopianPhone(input)).toThrow(
      InvalidPhoneNumberError,
    );
  });
});
