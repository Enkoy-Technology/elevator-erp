import { canSmsRecipient, logSmsConsentSkip } from './sms-consent';

describe('canSmsRecipient', () => {
  it('blocks a recipient with no smsConsentAt', () => {
    expect(canSmsRecipient({ smsConsentAt: null })).toBe(false);
  });

  it('allows a recipient once smsConsentAt is set', () => {
    expect(canSmsRecipient({ smsConsentAt: new Date('2026-01-01T00:00:00Z') })).toBe(true);
  });
});

describe('logSmsConsentSkip', () => {
  it('logs a line naming the recipient kind, id, and tenant — never silent', () => {
    const warn = jest.fn();
    logSmsConsentSkip({ warn }, {
      tenantId: 't1',
      recipientKind: 'technician',
      recipientId: 'u1',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    const [line] = warn.mock.calls[0] as [string];
    expect(line).toContain('technician');
    expect(line).toContain('u1');
    expect(line).toContain('t1');
  });
});
