import { AfroMessageProvider } from './afromessage.provider';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

/** Runs `send` to completion and returns whatever it threw (never undefined — fails the test if it didn't throw). */
// The client's own test handset — the only phone number allowed in this
// codebase's fixtures/specs/docs (task-3 brief §3.0 SAFETY). Every other
// number belongs to a real person.
const TEST_PHONE = '+251949922604';

const captureRejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected send() to reject, but it resolved');
};

describe('AfroMessageProvider', () => {
  const SECRET = 'super-secret-afromessage-key';
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('is named "afromessage"', () => {
    expect(new AfroMessageProvider(SECRET).name).toBe('afromessage');
  });

  it('sends Authorization: Bearer <key> and maps a success response to providerMessageId', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, {
        acknowledge: 'success',
        response: { status: 'Send in progress...', message_id: 'msg-123' },
      }),
    );

    const provider = new AfroMessageProvider(SECRET, 'MyBrand');
    const result = await provider.send(TEST_PHONE, 'hello');

    expect(result).toEqual({ providerMessageId: 'msg-123' });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.afromessage.com/api/send');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${SECRET}`,
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      to: TEST_PHONE,
      message: 'hello',
      sender: 'MyBrand',
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits sender when none is configured', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { acknowledge: 'success', response: { message_id: 'msg-1' } }),
    );
    await new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi');
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toEqual({
      to: TEST_PHONE,
      message: 'hi',
    });
  });

  it('throws with the provider error text on acknowledge=error, and never leaks the credential', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, {
        acknowledge: 'error',
        response: { errors: ['Unable to send your message. Message content is empty...'] },
      }),
    );

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, ''),
    );
    expect(err.message).toMatch(/Message content is empty/);
    expect(err.message).not.toContain(SECRET);
  });

  it('throws on a non-2xx HTTP status without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(401, { acknowledge: 'error' }));

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi'),
    );
    expect(err.message).toMatch(/401/);
    expect(err.message).not.toContain(SECRET);
  });

  it('throws when the response is not JSON, without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>gateway error</html>', { status: 502 }));

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi'),
    );
    expect(err.message).not.toContain(SECRET);
  });

  it('throws when acknowledge=success but response.message_id is missing (unverified shape drift), without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { acknowledge: 'success', response: {} }));

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi'),
    );
    expect(err.message).toMatch(/message_id/);
    expect(err.message).not.toContain(SECRET);
  });

  it('I1: redacts the credential even when the vendor ECHOES it back in the error body (unverified failure shape)', async () => {
    // AfroMessage's own error envelope is vendor-supplied text — this
    // simulates it echoing the submitted key back inside `response.errors`,
    // which the existing "never leaks" tests above don't: they only prove
    // OUR code never interpolates the key, not that a vendor-supplied
    // string containing it gets redacted.
    fetchSpy.mockResolvedValue(
      jsonResponse(200, {
        acknowledge: 'error',
        response: { errors: [`Invalid token: ${SECRET}`] },
      }),
    );

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi'),
    );
    expect(err.message).not.toContain(SECRET);
    expect(err.message).toContain('***');
  });

  it('throws on a network failure (e.g. DNS/connection) without leaking the credential', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const err = await captureRejection(
      new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi'),
    );
    expect(err.message).not.toContain(SECRET);
  });

  it('passes an AbortSignal so a hanging provider cannot wedge the dispatcher', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { acknowledge: 'success', response: { message_id: 'msg-1' } }),
    );

    await new AfroMessageProvider(SECRET).send(TEST_PHONE, 'hi');

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
