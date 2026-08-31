import { canSmsRecipient, logSmsConsentSkip } from './sms-consent';

describe('canSmsRecipient', () => {
  it('blocks a recipient with no smsConsentAt', () => {
    expect(canSmsRecipient({ smsConsentAt: null, smsConsentRevokedAt: null })).toBe(false);
  });

  it('allows a recipient once smsConsentAt is set and never revoked', () => {
    expect(
      canSmsRecipient({
        smsConsentAt: new Date('2026-01-01T00:00:00Z'),
        smsConsentRevokedAt: null,
      }),
    ).toBe(true);
  });

  // I3: a shared predicate only gives consistent wording, not consistent
  // enforcement, unless it also fails closed on a field a caller forgot to
  // populate — `!==` would have let `undefined` sneak through.
  it('fails closed when smsConsentAt is undefined, not just null', () => {
    expect(
      canSmsRecipient({
        smsConsentAt: undefined as unknown as null,
        smsConsentRevokedAt: null,
      }),
    ).toBe(false);
  });

  // I10: revoking must not erase the historical fact consent was once
  // given — smsConsentAt stays set, smsConsentRevokedAt is what actually
  // withdraws entitlement.
  it('blocks a recipient whose consent was revoked, even though smsConsentAt is still set', () => {
    expect(
      canSmsRecipient({
        smsConsentAt: new Date('2026-01-01T00:00:00Z'),
        smsConsentRevokedAt: new Date('2026-02-01T00:00:00Z'),
      }),
    ).toBe(false);
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
