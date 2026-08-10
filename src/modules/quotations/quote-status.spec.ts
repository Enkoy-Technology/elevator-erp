import {
  canTransitionQuoteStatus,
  QUOTE_STATUS_TRANSITIONS,
} from './quote-status';

describe('quote status DAG', () => {
  it('allows the happy-path chain DRAFT → PENDING_APPROVAL → APPROVED → CONVERTED_TO_PROFORMA', () => {
    const chain = [
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'CONVERTED_TO_PROFORMA',
    ] as const;
    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(canTransitionQuoteStatus(chain[i]!, chain[i + 1]!)).toBe(true);
    }
  });

  it('rejects skipping submission (DRAFT → APPROVED/CONVERTED_TO_PROFORMA)', () => {
    expect(canTransitionQuoteStatus('DRAFT', 'APPROVED')).toBe(false);
    expect(canTransitionQuoteStatus('DRAFT', 'CONVERTED_TO_PROFORMA')).toBe(
      false,
    );
  });

  it('allows DRAFT and PENDING_APPROVAL to lapse to EXPIRED', () => {
    expect(canTransitionQuoteStatus('DRAFT', 'EXPIRED')).toBe(true);
    expect(canTransitionQuoteStatus('PENDING_APPROVAL', 'EXPIRED')).toBe(true);
  });

  it('allows PENDING_APPROVAL → REJECTED', () => {
    expect(canTransitionQuoteStatus('PENDING_APPROVAL', 'REJECTED')).toBe(
      true,
    );
  });

  it('cannot resurrect terminal statuses', () => {
    expect(QUOTE_STATUS_TRANSITIONS.REJECTED).toEqual([]);
    expect(QUOTE_STATUS_TRANSITIONS.EXPIRED).toEqual([]);
    expect(QUOTE_STATUS_TRANSITIONS.CONVERTED_TO_PROFORMA).toEqual([]);
  });

  // Drift guard: ProformasRepository.issue() hardcodes the literal
  // 'APPROVED' -> 'CONVERTED_TO_PROFORMA' transition (deliberately, to avoid
  // a proformas -> quotations module import — see task-2-report.md) instead
  // of referencing this DAG. If a second APPROVED transition is ever added
  // here, that literal silently stops matching this table — this test fails
  // first instead of the drift going unnoticed.
  it('keeps APPROVED a single-edge transition, matching the hardcoded CAS in proformas.repository.ts', () => {
    expect(QUOTE_STATUS_TRANSITIONS.APPROVED).toEqual(['CONVERTED_TO_PROFORMA']);
  });
});
