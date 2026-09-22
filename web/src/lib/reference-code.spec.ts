import { composeReferenceCode } from './reference-code';

describe('composeReferenceCode', () => {
  it('joins the people and the model with one space', () => {
    expect(composeReferenceCode('KALKIDAN AND MIKA', 'FUJI-E22')).toBe(
      'KALKIDAN AND MIKA FUJI-E22',
    );
  });

  it('prints the sales name alone when there is no model code', () => {
    expect(composeReferenceCode('KALKIDAN AND MIKA', null)).toBe(
      'KALKIDAN AND MIKA',
    );
  });

  it('prints an old quotation exactly as it printed before', () => {
    expect(composeReferenceCode(null, 'FUJI-E22')).toBe('FUJI-E22');
  });

  it('is empty when neither half is stated, so the row is not printed', () => {
    expect(composeReferenceCode(null, null)).toBe('');
    expect(composeReferenceCode('  ', '')).toBe('');
  });
});
