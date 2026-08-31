import { formatEtb as docxFormatEtb } from './quotation.docx-template';
import { formatEtb as pdfFormatEtb } from './quotation.template';
import { formatEtb, vatPercentLabel } from './money-format';

describe('formatEtb', () => {
  it('groups a decimal money string into thousands with a 2dp ETB suffix', () => {
    expect(formatEtb('143750.00')).toBe('143,750.00 ETB');
  });

  it('formats a bare integer decimal string with 2dp', () => {
    expect(formatEtb('0')).toBe('0.00 ETB');
  });

  it('returns 0.00 ETB for an empty string', () => {
    expect(formatEtb('')).toBe('0.00 ETB');
  });

  it('returns 0.00 ETB for a whitespace-only string', () => {
    expect(formatEtb('   ')).toBe('0.00 ETB');
  });

  it('tolerates incidental leading/trailing whitespace around a real value', () => {
    // decimal.js does not trim internally (`new Decimal('  1.00  ')`
    // throws) — a hand-edited/copy-pasted field with stray whitespace must
    // still parse instead of hard-failing document generation.
    expect(formatEtb('  1234.50  ')).toBe('1,234.50 ETB');
  });

  it('returns 0.00 ETB for null and undefined (no amount entered yet)', () => {
    expect(formatEtb(null)).toBe('0.00 ETB');
    expect(formatEtb(undefined)).toBe('0.00 ETB');
  });

  it('throws on a non-parseable value instead of silently rendering 0.00', () => {
    // This lands on a customer-facing document — coercing garbage to 0.00
    // would misstate money rather than surface the bug.
    expect(() => formatEtb('not-a-number')).toThrow();
    expect(() => formatEtb('12.34.56')).toThrow();
  });
});

describe('vatPercentLabel', () => {
  it('derives the rate implied by a subtotal/vat pair', () => {
    expect(vatPercentLabel('100000.00', '15000.00')).toBe('15.00');
  });

  it('returns 0.00 when subtotal is zero (avoids dividing by zero)', () => {
    expect(vatPercentLabel('0.00', '0.00')).toBe('0.00');
  });

  it('returns 0.00 when subtotal is null/undefined', () => {
    expect(vatPercentLabel(null, '15000.00')).toBe('0.00');
    expect(vatPercentLabel(undefined, '15000.00')).toBe('0.00');
  });

  it('treats a missing vat as 0', () => {
    expect(vatPercentLabel('100000.00', null)).toBe('0.00');
  });
});

describe('formatEtb — shared between the PDF and Word renderers', () => {
  it('quotation.template.ts (PDF) and quotation.docx-template.ts (Word) re-export the exact same formatter', () => {
    // Import identity, not just equal output: the PDF and Word quotation
    // renderers must format money through the one shared function so a
    // future rounding/grouping change can't silently diverge between the
    // two document formats.
    expect(pdfFormatEtb).toBe(formatEtb);
    expect(docxFormatEtb).toBe(formatEtb);
  });
});
