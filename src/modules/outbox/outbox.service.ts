import { Inject, Injectable } from '@nestjs/common';

import { normalizeEthiopianPhone } from '../../common/phone';
import type { PaginatedResult } from '../../common/pagination';
import type { MessageChannel } from '../../database/schema';
import type { AuthenticatedUser } from '../../types/auth.types';
import { SMS_PROVIDER } from './outbox.constants';
import type { OutboundMessageRecord, OutboxListFilter } from './outbox.repository';
import { OutboxRepository } from './outbox.repository';
import type { SmsProvider } from './providers/sms-provider.interface';

export interface EnqueueMessageInput {
  tenantId: string;
  channel: MessageChannel;
  recipient: string;
  body: string;
  dedupeKey: string;
  subjectKind?: string;
  subjectId?: string;
  createdByUserId?: string;
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * The only way anything in this codebase enqueues an outbound message
   * (task brief 5.4) — internal, no HTTP surface; Task 2 (reminders) and
   * Task 3 (message-log UI) are the callers. Normalises the recipient up
   * front so a malformed phone number fails loudly right here, at the point
   * a human can fix it, rather than three retries deep in the dispatcher —
   * see InvalidPhoneNumberError's own doc comment.
   */
  async enqueue(input: EnqueueMessageInput): Promise<OutboundMessageRecord> {
    const recipient =
      input.channel === 'SMS'
        ? normalizeEthiopianPhone(input.recipient)
        : input.recipient.trim();

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

  /** The message-log UI (task-3 brief §3.3) — thin pass-throughs, same shape as InvoicesService.list/streamAll/etc. */
  list(
    user: AuthenticatedUser,
    filter: OutboxListFilter,
    page?: string,
    pageSize?: string,
  ): Promise<PaginatedResult<OutboundMessageRecord>> {
    return this.outboxRepository.list(user.tenantId, filter, page, pageSize);
  }

  streamAll(
    user: AuthenticatedUser,
    filter: OutboxListFilter,
  ): AsyncGenerator<OutboundMessageRecord> {
    return this.outboxRepository.streamAll(user.tenantId, filter);
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
