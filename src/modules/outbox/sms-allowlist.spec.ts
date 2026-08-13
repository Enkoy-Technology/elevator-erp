import { parseSmsAllowlist, smsAllowlistBlockReason } from './sms-allowlist';

// The client's own test handset — the only phone number allowed anywhere in
// this codebase's fixtures/specs/docs (task-3 brief §3.0 SAFETY). Where a
// test needs a recipient that is deliberately NOT on the allowlist, it uses
// an obviously-not-a-phone-number placeholder instead of inventing a second
// number — the brief is explicit that inventing one, even a fake-looking
// one, is exactly what must not happen.
const TEST_PHONE = '+251949922604';
const NOT_ALLOWLISTED = 'not-allowlisted-recipient';

describe('parseSmsAllowlist', () => {
  it('splits on commas and trims whitespace', () => {
    expect(parseSmsAllowlist(` ${TEST_PHONE} , ${NOT_ALLOWLISTED} `)).toEqual([
      TEST_PHONE,
      NOT_ALLOWLISTED,
    ]);
  });

  it('drops empty entries (trailing comma, blank string)', () => {
    expect(parseSmsAllowlist(`${TEST_PHONE},`)).toEqual([TEST_PHONE]);
    expect(parseSmsAllowlist('')).toEqual([]);
    expect(parseSmsAllowlist('   ')).toEqual([]);
  });
});

// task-3 brief §3.0 / I2: "Test all four branches" — this is branch 1.
// Gated on SMS_LIVE, not NODE_ENV — see sms-allowlist.ts's own doc comment
// for why (an idiomatic Dockerfile sets NODE_ENV=production for any built
// Node app, staging included; that must not be enough to disable this).
describe('smsAllowlistBlockReason — SMS_LIVE=1', () => {
  it('never blocks when live, allowlist ignored entirely', () => {
    expect(smsAllowlistBlockReason(true, [], NOT_ALLOWLISTED)).toBeNull();
    expect(smsAllowlistBlockReason(true, [TEST_PHONE], NOT_ALLOWLISTED)).toBeNull();
  });
});

// Branch 2.
describe('smsAllowlistBlockReason — not live, empty allowlist', () => {
  it('never blocks (only reachable with SMS_PROVIDER=noop in practice — a real provider with an empty allowlist already refuses to boot)', () => {
    expect(smsAllowlistBlockReason(false, [], NOT_ALLOWLISTED)).toBeNull();
  });
});

// Branch 3.
describe('smsAllowlistBlockReason — not live, recipient on the list', () => {
  it('does not block', () => {
    expect(smsAllowlistBlockReason(false, [TEST_PHONE], TEST_PHONE)).toBeNull();
  });
});

// Branch 4.
describe('smsAllowlistBlockReason — not live, recipient NOT on the list', () => {
  it('blocks with an explanatory, credential-free reason naming the recipient', () => {
    const reason = smsAllowlistBlockReason(false, [TEST_PHONE], NOT_ALLOWLISTED);
    expect(reason).not.toBeNull();
    expect(reason).toContain(NOT_ALLOWLISTED);
    expect(reason).toMatch(/SMS_ALLOWLIST/);
    expect(reason).toMatch(/SMS_LIVE/);
  });
});
