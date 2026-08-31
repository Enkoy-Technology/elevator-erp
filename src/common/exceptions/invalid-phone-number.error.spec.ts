import { InvalidPhoneNumberError } from './invalid-phone-number.error';

describe('InvalidPhoneNumberError — masks the raw input in its own message', () => {
  it('keeps only the last 4 characters visible', () => {
    const err = new InvalidPhoneNumberError('0911 2345');
    expect(err.message).not.toContain('0911 2345');
    expect(err.message).toContain('2345');
  });

  it('masks a short input entirely rather than leaking it whole', () => {
    const err = new InvalidPhoneNumberError('abc');
    expect(err.message).not.toContain('abc');
    expect(err.message).toContain('****');
  });
});
