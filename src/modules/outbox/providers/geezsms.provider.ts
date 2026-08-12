import { Injectable } from '@nestjs/common';

import type { SmsProvider } from './sms-provider.interface';

const BASE_URL = 'https://api.geezsms.com/api/v1';
const REQUEST_TIMEOUT_MS = 10_000;

interface GeezSmsBody {
  message_status?: string;
  api_log_id?: number | string;
  message?: string;
  log?: string;
  error?: unknown;
}

/**
 * GeezSMS (Postman docs: https://documenter.getpostman.com/view/11254016/TzK2YZ2J)
 * adapter — plain `fetch`, no SDK (GeezSMS publishes an official TS SDK, but
 * one HTTP POST does not justify a dependency, and `SmsProvider` already
 * isolates the rest of the app from this choice).
 *
 * VERIFIED against the vendor's OWN published Postman collection (task-3
 * brief: "fetch the live documentation yourself... do not present a guess as
 * a verified fact") — the documenter.getpostman.com page itself renders
 * client-side, but it loads its content from a public, unauthenticated JSON
 * API (`documenter.gw.postman.com/api/collections/...`) that was fetched
 * directly, giving the actual vendor-authored collection, not a third-party
 * guess. The "Send SMS" request in that collection documents both a GET
 * (`?token=...&phone=...&msg=...&shortcode_id=...`) and a POST (form fields:
 * `token`, `phone`, `msg`, `shortcode_id`, `callback`) against
 * `https://api.geezsms.com/api/v1/sms/send`, with this exact response
 * example attached to the POST request:
 *   {
 *     "message_status": "success",
 *     "log": "async 908703ee-3898-4b45-b0e9-6fb05d7619a5",
 *     "phone": "25100000000",
 *     "message": "Test message",
 *     "api_log_id": 6569829
 *   }
 * This adapter uses POST with an `application/x-www-form-urlencoded` body
 * (not the collection's literal "formdata"/multipart) — cross-confirmed
 * working in at least two independent production Laravel integrations using
 * `Http::asForm()` (which sends urlencoded, not multipart) against this same
 * endpoint; urlencoded avoids multipart boundary handling for one HTTP POST.
 *
 * UNVERIFIED (flagged here and in the report — watch this on the first live
 * test):
 *  - The vendor's collection shows no FAILURE example for `/sms/send`
 *    itself (only a prose description on the separate bulk-send request:
 *    "an error flag... and an optional message"). This adapter treats
 *    `message_status !== 'success'` (including its absence) as failure and
 *    surfaces whatever of `error`/`message`/`log` is present — the exact
 *    failure JSON shape (rejected phone, low balance, bad token) has not
 *    been observed.
 *  - The collection's phone-format description literally says the number
 *    "must start with 2519" (mobile prefix), with no mention of Safaricom
 *    Ethiopia's 07-prefixed numbers. Confirm Safaricom-SIM delivery
 *    explicitly on the first live test (the runbook's delivery-test
 *    procedure already calls for both carriers).
 */
@Injectable()
export class GeezSmsProvider implements SmsProvider {
  readonly name = 'geezsms';

  constructor(
    private readonly token: string,
    private readonly shortcodeId?: string,
  ) {}

  async send(to: string, body: string): Promise<{ providerMessageId: string }> {
    // GeezSMS's documented phone shape has no leading '+' (e.g. "2519...");
    // `to` arrives here already E.164-normalised by OutboxService.enqueue.
    const phone = to.replace(/^\+/, '');

    const form = new URLSearchParams({ token: this.token, phone, msg: body });
    if (this.shortcodeId) {
      form.set('shortcode_id', this.shortcodeId);
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/sms/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        // Never log `this.token` anywhere, including in a thrown error below
        // — a hanging/misconfigured provider must not leak it via
        // `lastError` on the outbound_messages row (task-3 brief).
        body: form.toString(),
        // A hanging provider must not wedge the dispatcher's minute cron.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // `cause` never reaches `lastError` (OutboxDispatcherService's
      // errorMessage() only reads `.message`) — safe to attach for
      // debuggability without risking a credential leak.
      throw new Error(`GeezSMS request failed: ${networkErrorMessage(err)}`, {
        cause: err,
      });
    }

    const text = await response.text();
    let parsed: GeezSmsBody;
    try {
      parsed = JSON.parse(text) as GeezSmsBody;
    } catch {
      throw new Error(`GeezSMS returned a non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok || parsed.message_status !== 'success' || parsed.error) {
      const detail =
        stringifyErrorField(parsed.error) ||
        parsed.message ||
        parsed.log ||
        `HTTP ${response.status}, message_status=${parsed.message_status ?? 'unknown'}`;
      throw new Error(`GeezSMS send failed: ${detail}`);
    }

    if (parsed.api_log_id === undefined || parsed.api_log_id === null) {
      // The one documented success example always carries api_log_id — a
      // "success" body without one means the shape changed since this was
      // verified. Surfacing that loudly (via lastError) beats inventing a
      // fake id and recording a silent false "sent".
      throw new Error(
        'GeezSMS reported success but api_log_id was missing — response shape may have changed since this adapter was verified',
      );
    }
    return { providerMessageId: String(parsed.api_log_id) };
  }
}

const networkErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const stringifyErrorField = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === false) {
    return undefined;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
};
