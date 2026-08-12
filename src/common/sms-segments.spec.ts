import { segmentsFor } from './sms-segments';

describe('segmentsFor', () => {
  it('a plain ASCII reminder fits one GSM-7 segment', () => {
    expect(segmentsFor('Your payment of ETB 1,500.00 is due tomorrow.')).toEqual({
      encoding: 'GSM7',
      segments: 1,
    });
  });

  it('exactly 160 GSM-7 characters is still one segment', () => {
    expect(segmentsFor('A'.repeat(160))).toEqual({
      encoding: 'GSM7',
      segments: 1,
    });
  });

  it('161 GSM-7 characters spills into a 2nd concatenated segment (153/segment)', () => {
    expect(segmentsFor('A'.repeat(161))).toEqual({
      encoding: 'GSM7',
      segments: 2,
    });
  });

  it('a long GSM-7 body spans multiple 153-char concatenated segments', () => {
    expect(segmentsFor('A'.repeat(153 * 3 + 1))).toEqual({
      encoding: 'GSM7',
      segments: 4,
    });
  });

  // ሰላም ("hello") — any Ethiopic character is outside the GSM-7 alphabet, so
  // the whole message (not just the Amharic part) is forced to UCS-2. This
  // is the exact case that would triple a naive template's SMS bill if
  // nobody warned the author: 160-char GSM-7 budget silently becomes 70.
  it('a short Amharic body forces UCS-2, still one segment (<=70 chars)', () => {
    expect(segmentsFor('ሰላም')).toEqual({ encoding: 'UCS2', segments: 1 });
  });

  it('exactly 70 UCS-2 characters is still one segment', () => {
    expect(segmentsFor('ሀ'.repeat(70))).toEqual({
      encoding: 'UCS2',
      segments: 1,
    });
  });

  it('71 UCS-2 characters spills into a 2nd concatenated segment (67/segment)', () => {
    expect(segmentsFor('ሀ'.repeat(71))).toEqual({
      encoding: 'UCS2',
      segments: 2,
    });
  });

  it('one non-GSM-7 character among otherwise-plain ASCII still forces UCS-2', () => {
    expect(segmentsFor('Reminder ሀ')).toEqual({ encoding: 'UCS2', segments: 1 });
  });

  it('GSM-7 extension-table characters (e.g. the euro sign) still count as GSM-7', () => {
    expect(segmentsFor('Total: 100€')).toEqual({ encoding: 'GSM7', segments: 1 });
  });
});
