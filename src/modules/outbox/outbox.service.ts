import { Injectable } from '@nestjs/common';

import { normalizeEthiopianPhone } from '../../common/phone';
import type { MessageChannel } from '../../database/schema';
import type { OutboundMessageRecord } from './outbox.repository';
import { OutboxRepository } from './outbox.repository';

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
  constructor(private readonly outboxRepository: OutboxRepository) {}

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
}
