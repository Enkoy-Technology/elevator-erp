import { Inject, Injectable, Logger } from '@nestjs/common';

import { SmsConsentRequiredError } from '../../common/exceptions';
import { normalizeEthiopianPhone } from '../../common/phone';
import type { PaginatedResult } from '../../common/pagination';
import { segmentsFor } from '../../common/sms-segments';
import type { AuthenticatedUser } from '../../types/auth.types';
import { SMS_PROVIDER } from './outbox.constants';
import type { OutboundMessageRecord, OutboxListFilter } from './outbox.repository';
import { OutboxRepository } from './outbox.repository';
import type { SmsProvider } from './providers/sms-provider.interface';

interface EnqueueMessageBase {
  tenantId: string;
  recipient: string;
  body: string;
  dedupeKey: string;
  subjectKind?: string;
  subjectId?: string;
  createdByUserId?: string;
}

/**
 * Discriminated on `channel` so the type system itself enforces consent
 * (phase-5 review I3): `consentAt` is REQUIRED, not optional, whenever
 * `channel` is `'SMS'` — there is no way to construct an SMS enqueue call
 * without supplying an answer to "does this recipient consent", null or
 * not. Before this, `common/sms-consent.ts`'s `canSmsRecipient` was a
 * shared predicate that gave every caller consistent WORDING, but nothing
 * stopped a caller from simply never calling it — consistent enforcement
 * needed a choke point, not a convention. `consentAt` should be the
 * recipient's EFFECTIVE consent timestamp (i.e. already run through
 * `canSmsRecipient`, which also accounts for a later revoke — see I10) —
 * `enqueue` below refuses whenever it is null.
 */
export type EnqueueMessageInput =
  | (EnqueueMessageBase & { channel: 'SMS'; consentAt: Date | null })
  | (EnqueueMessageBase & { channel: 'EMAIL' });

/** Segment count above which a template is spending more than it needs to
 * (phase-5 review I5) — 2 is the line where an Amharic customer name/site
 * (forced UCS-2, 70 chars/segment) or a longer legal name starts doubling
 * cost, not a hard cap on what can be sent. */
const SEGMENT_WARNING_THRESHOLD = 2;

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * The only way anything in this codebase enqueues an outbound message
   * (task brief 5.4) — internal, no HTTP surface; Task 2 (reminders) and
   * Task 3 (message-log UI) are the callers. Refuses an SMS with no consent
   * on file (I3) before anything else, then normalises the recipient so a
   * malformed phone number fails loudly right here, at the point a human
   * can fix it, rather than three retries deep in the dispatcher — see
   * InvalidPhoneNumberError's own doc comment.
   */
  async enqueue(input: EnqueueMessageInput): Promise<OutboundMessageRecord> {
    if (input.channel === 'SMS' && input.consentAt == null) {
      throw new SmsConsentRequiredError();
    }

    const recipient =
      input.channel === 'SMS'
        ? normalizeEthiopianPhone(input.recipient)
        : input.recipient.trim();

    if (input.channel === 'SMS') {
      const { encoding, segments } = segmentsFor(input.body);
      if (segments > SEGMENT_WARNING_THRESHOLD) {
        this.logger.warn(
          `SMS body encodes as ${encoding} and needs ${segments} segments (dedupeKey ${input.dedupeKey}) — each segment beyond the first is a full extra charge.`,
        );
      }
    }

    return this.outboxRepository.enqueue(input.tenantId, {
      channel: input.channel,
      recipient,
      body: input.body,
      dedupeKey: input.dedupeKey,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      createdByUserId: input.createdByUserId,
    });
  }

  /** The message-log UI (task-3 brief §3.3) — thin pass-throughs, same shape as InvoicesService.list/streamAll/etc. `segments` (I5) is computed on read, never stored. */
  async list(
    user: AuthenticatedUser,
    filter: OutboxListFilter,
    page?: string,
    pageSize?: string,
  ): Promise<PaginatedResult<OutboundMessageWithSegments>> {
    const result = await this.outboxRepository.list(
      user.tenantId,
      filter,
      page,
      pageSize,
    );
    return { ...result, items: result.items.map(withSegments) };
  }

  async *streamAll(
    user: AuthenticatedUser,
    filter: OutboxListFilter,
  ): AsyncGenerator<OutboundMessageWithSegments> {
    for await (const row of this.outboxRepository.streamAll(user.tenantId, filter)) {
      yield withSegments(row);
    }
  }

  retry(user: AuthenticatedUser, id: string): Promise<OutboundMessageRecord> {
    return this.outboxRepository.retry(user.tenantId, id);
  }

  /** Which SmsProvider adapter is actually wired up (task-3 brief §3.3: "so
   * nobody mistakes a dev deployment for a live one") — 'noop' means
   * nothing really sends. */
  getSmsProviderName(): string {
    return this.smsProvider.name;
  }
}

/** Message-log row plus its on-demand segment count/encoding (I5) — the
 * cost-visibility column the message log UI and its CSV/XLSX export both
 * surface. `segmentsFor` ignores channel (EMAIL rows just get a number
 * nobody reads), which is fine — simpler than branching for a column
 * nobody's asked to hide on non-SMS rows. */
export type OutboundMessageWithSegments = OutboundMessageRecord & {
  segments: number;
};

const withSegments = (row: OutboundMessageRecord): OutboundMessageWithSegments => ({
  ...row,
  segments: segmentsFor(row.body).segments,
});
