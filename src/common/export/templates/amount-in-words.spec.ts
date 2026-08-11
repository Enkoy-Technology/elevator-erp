import { amountInWords } from './amount-in-words';

describe('amountInWords', () => {
  it.each([
    ['0', 'Zero Birr and 00/100'],
    ['1', 'One Birr and 00/100'],
    ['15', 'Fifteen Birr and 00/100'],
    ['100', 'One hundred Birr and 00/100'],
    ['1000', 'One thousand Birr and 00/100'],
    ['112.00', 'One hundred twelve Birr and 00/100'],
    [
      '1234567.89',
      'One million two hundred thirty-four thousand five hundred sixty-seven Birr and 89/100',
    ],
  ])('renders %s as %s', (value, expected) => {
    expect(amountInWords(value)).toBe(expected);
  });

  it('always renders the cents form, even for a whole number with no decimal part', () => {
    expect(amountInWords('7')).toMatch(/ and 00\/100$/);
  });

  it('rounds a longer fractional value to 2dp before spelling out cents', () => {
    expect(amountInWords('9.995')).toBe('Ten Birr and 00/100');
  });

  it('throws on a negative amount', () => {
    expect(() => amountInWords('-5.00')).toThrow(/non-negative/);
  });

  it('throws on garbage input', () => {
    expect(() => amountInWords('not-a-number')).toThrow(/not a valid decimal string/);
  });

  it('throws on empty input', () => {
    expect(() => amountInWords('')).toThrow(/value is required/);
  });
});
