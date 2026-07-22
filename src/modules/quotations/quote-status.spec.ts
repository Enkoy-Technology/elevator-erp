import {
  canTransitionQuoteStatus,
  QUOTE_STATUS_TRANSITIONS,
} from './quote-status';

describe('quote status DAG', () => {
  it('allows the happy-path chain DRAFT → APPROVED → PROFORMA → CONTRACT', () => {
    const chain = ['DRAFT', 'APPROVED', 'PROFORMA', 'CONTRACT'] as const;
    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(canTransitionQuoteStatus(chain[i]!, chain[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping approval (DRAFT → PROFORMA/CONTRACT)', () => {
    expect(canTransitionQuoteStatus('DRAFT', 'PROFORMA')).toBe(false);
    expect(canTransitionQuoteStatus('DRAFT', 'CONTRACT')).toBe(false);
  });

  it('cannot resurrect terminal statuses', () => {
    expect(QUOTE_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(QUOTE_STATUS_TRANSITIONS.CONTRACT).toEqual([]);
    expect(QUOTE_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('allows CANCELLED from every non-terminal status', () => {
    for (const [from, next] of Object.entries(QUOTE_STATUS_TRANSITIONS)) {
      if (from === 'REJECTED' || from === 'CONTRACT' || from === 'CANCELLED') {
        expect(next.includes('CANCELLED')).toBe(false);
      } else {
        expect(next).toContain('CANCELLED');
      }
    }
  });
});
