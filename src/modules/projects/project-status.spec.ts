import {
  canTransitionProjectStatus,
  PROJECT_STATUS_TRANSITIONS,
} from './project-status';

describe('project status DAG', () => {
  it('allows the happy-path chain LEAD through COMPLETED', () => {
    const chain = [
      'LEAD',
      'SITE_SURVEY',
      'SPEC_CALCULATION',
      'QUOTATION',
      'PROFORMA',
      'CONTRACT',
      'EXECUTION',
      'COMPLETED',
    ] as const;
    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(canTransitionProjectStatus(chain[i]!, chain[i + 1]!)).toBe(true);
    }
  });

  it('allows CANCELLED from each non-terminal status except EXECUTION', () => {
    for (const [from, next] of Object.entries(PROJECT_STATUS_TRANSITIONS)) {
      if (from === 'EXECUTION' || from === 'COMPLETED' || from === 'CANCELLED') {
        expect(next.includes('CANCELLED')).toBe(false);
      } else {
        expect(next).toContain('CANCELLED');
      }
    }
  });

  it('treats COMPLETED and CANCELLED as terminal', () => {
    expect(PROJECT_STATUS_TRANSITIONS.COMPLETED).toEqual([]);
    expect(PROJECT_STATUS_TRANSITIONS.CANCELLED).toEqual([]);
  });
});
