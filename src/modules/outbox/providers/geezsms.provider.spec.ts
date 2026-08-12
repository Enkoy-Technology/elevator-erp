import { GeezSmsProvider } from './geezsms.provider';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status });

/** Runs `send` to completion and returns whatever it threw (never undefined — fails the test if it didn't throw). */
const captureRejection = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error('expected send() to reject, but it resolved');
};

describe('GeezSmsProvider', () => {
  const TOKEN = 'super-secret-geezsms-token';
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('is named "geezsms"', () => {
    expect(new GeezSmsProvider(TOKEN).name).toBe('geezsms');
  });

  it('POSTs a form body (token/phone/msg) and maps the vendor-documented success shape to providerMessageId', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, {
        message_status: 'success',
        log: 'async 908703ee-3898-4b45-b0e9-6fb05d7619a5',
        phone: '251911234567',
        message: 'hello',
        api_log_id: 6569829,
      }),
    );

    const provider = new GeezSmsProvider(TOKEN, '42');
    const result = await provider.send('+251911234567', 'hello');

    expect(result).toEqual({ providerMessageId: '6569829' });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://api.geezsms.com/api/v1/sms/send');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    const form = new URLSearchParams(init?.body as string);
    // The leading '+' is stripped — GeezSMS's documented phone shape has none.
    expect(form.get('phone')).toBe('251911234567');
    expect(form.get('msg')).toBe('hello');
    expect(form.get('token')).toBe(TOKEN);
    expect(form.get('shortcode_id')).toBe('42');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits shortcode_id when none is configured', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { message_status: 'success', api_log_id: 1 }),
    );
    await new GeezSmsProvider(TOKEN).send('+251911234567', 'hi');
    const form = new URLSearchParams(fetchSpy.mock.calls[0]![1]?.body as string);
    expect(form.has('shortcode_id')).toBe(false);
  });

  it('throws when message_status is not "success", and never leaks the credential', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { message_status: 'failed', message: 'invalid phone number' }),
    );

    const err = await captureRejection(
      new GeezSmsProvider(TOKEN).send('+251911234567', 'hi'),
    );
    expect(err.message).toMatch(/invalid phone number/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('throws on a non-2xx HTTP status without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, {}));

    const err = await captureRejection(
      new GeezSmsProvider(TOKEN).send('+251911234567', 'hi'),
    );
    expect(err.message).toMatch(/500/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('throws when the response is not JSON, without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(new Response('<html>gateway error</html>', { status: 502 }));

    const err = await captureRejection(
      new GeezSmsProvider(TOKEN).send('+251911234567', 'hi'),
    );
    expect(err.message).not.toContain(TOKEN);
  });

  it('throws when message_status=success but api_log_id is missing (unverified shape drift), without leaking the credential', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { message_status: 'success' }));

    const err = await captureRejection(
      new GeezSmsProvider(TOKEN).send('+251911234567', 'hi'),
    );
    expect(err.message).toMatch(/api_log_id/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('throws on a network failure (e.g. DNS/connection) without leaking the credential', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'));

    const err = await captureRejection(
      new GeezSmsProvider(TOKEN).send('+251911234567', 'hi'),
    );
    expect(err.message).not.toContain(TOKEN);
  });

  it('passes an AbortSignal so a hanging provider cannot wedge the dispatcher', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, { message_status: 'success', api_log_id: 1 }),
    );

    await new GeezSmsProvider(TOKEN).send('+251911234567', 'hi');

    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
