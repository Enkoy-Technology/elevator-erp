import { NoopSmsProvider } from './noop-sms.provider';

describe('NoopSmsProvider', () => {
  it('is named "noop" — this is what makes it obvious in the message log that nothing really sent', () => {
    expect(new NoopSmsProvider().name).toBe('noop');
  });

  it('returns a synthetic providerMessageId without contacting any real gateway', async () => {
    const provider = new NoopSmsProvider();

    const result = await provider.send('+251949922604', 'hello');

    expect(result.providerMessageId).toEqual(expect.stringMatching(/^noop-/));
  });
});
