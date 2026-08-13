import { Injectable } from '@nestjs/common';

import type { SmsProvider } from './sms-provider.interface';

const BASE_URL = 'https://api.afromessage.com/api';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `response.errors` is a string array per AfroMessage's own error example
 * (see this file's doc comment) — never a single `.message` field.
 */
interface AfroMessageBody {
  acknowledge?: string;
  response?: {
    message_id?: string;
    errors?: string[];
  };
}

/**
 * AfroMessage (https://afromessage.com/developers) adapter — plain `fetch`,
 * no SDK: one HTTP POST does not justify pulling in a dependency, and
 * `SmsProvider` already isolates the rest of the app from this choice.
 *
 * VERIFIED, not guessed (task-3 brief: "fetch the live documentation
 * yourself... do not present a guess as a verified fact"). The Angular SPA
 * at afromessage.com/developers renders client-side and can't be scraped as
 * HTML, so the request/response shape below was confirmed two independent
 * ways: (1) the doc site's own compiled JS bundle, which has the full
 * curl/Java/Python/PHP examples and JSON samples baked in as literal
 * template strings — e.g. verbatim from that bundle:
 *   curl -XPOST -H 'Authorization: Bearer YOUR_TOKEN' \
 *     -H "Content-type: application/json" \
 *     -d '{"from":"YOUR_IDENTIFIER_ID","sender":"YOUR_SENDER_NAME","to":"YOUR_RECIPIENT","message":"YOUR_MESSAGE","callback":"YOUR_CALLBACK"}' \
 *     'https://api.afromessage.com/api/send'
 *   // success: {"acknowledge":"success","response":{"status":"...","message_id":"9ab2867c-...","message":"...","to":"..."}}
 *   // failure: {"acknowledge":"error","response":{"errors":["Unable to send your message. Message content is empty..."]}}
 * and (2) cross-checked against the published `abduselam1/afromessage`
 * Laravel SDK's real source (`AfroMessage.php`/`AfroResponse.php`), which
 * hits the identical endpoint/fields/envelope. Nothing about this adapter's
 * request or response handling is a guess.
 *
 * `from` (AfroMessage's "system identifier id" for accounts with multiple
 * subscribed short codes) is NOT wired up — nothing in this codebase's
 * brief needs multiple short codes, and `sender` (the human-readable
 * branded name, this adapter's one configurable knob) covers what the
 * brief actually asks for. Add `AFROMESSAGE_FROM` if that ever changes.
 */
@Injectable()
export class AfroMessageProvider implements SmsProvider {
  readonly name = 'afromessage';

  constructor(
    private readonly apiKey: string,
    private readonly sender?: string,
  ) {}

  async send(to: string, body: string): Promise<{ providerMessageId: string }> {
    const payload: Record<string, string> = { to, message: body };
    if (this.sender) {
      payload.sender = this.sender;
    }

    let response: Response;
    try {
      response = await fetch(`${BASE_URL}/send`, {
        method: 'POST',
        headers: {
          // Never log `this.apiKey` anywhere, including in a thrown error
          // below — a hanging/misconfigured provider must not leak it via
          // `lastError` on the outbound_messages row (task-3 brief).
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        // A hanging provider must not wedge the dispatcher's minute cron.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // `cause` never reaches `lastError` (OutboxDispatcherService's
      // errorMessage() only reads `.message`) — safe to attach for
      // debuggability without risking a credential leak.
      throw new Error(`AfroMessage request failed: ${networkErrorMessage(err)}`, {
        cause: err,
      });
    }

    const text = await response.text();
    let parsed: AfroMessageBody;
    try {
      parsed = JSON.parse(text) as AfroMessageBody;
    } catch {
      throw new Error(
        `AfroMessage returned a non-JSON response (HTTP ${response.status})`,
      );
    }

    if (!response.ok || parsed.acknowledge !== 'success') {
      const rawDetail =
        parsed.response?.errors?.join('; ') ||
        `HTTP ${response.status}, acknowledge=${parsed.acknowledge ?? 'unknown'}`;
      // I1: `response.errors` is vendor-supplied text — if AfroMessage ever
      // echoes the request back in its error body, `this.apiKey` could ride
      // along straight into `lastError`, which GET /outbox serves, the
      // message-log UI renders, and the CSV export ships. Redact before it
      // ever reaches a thrown Error, not after.
      throw new Error(`AfroMessage send failed: ${redactSecret(rawDetail, this.apiKey)}`);
    }

    const messageId = parsed.response?.message_id;
    if (!messageId) {
      // Every documented success example carries response.message_id — an
      // "acknowledge":"success" body without one means the shape changed
      // since this was verified. Surfacing that loudly (via lastError) beats
      // inventing a fake id and recording a silent false "sent".
      throw new Error(
        'AfroMessage reported success but response.message_id was missing — response shape may have changed since this adapter was verified',
      );
    }
    return { providerMessageId: messageId };
  }
}

const networkErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** I1: strip our own credential out of any provider-supplied text before it reaches a thrown error. */
const redactSecret = (text: string, secret: string): string =>
  secret ? text.split(secret).join('***') : text;
