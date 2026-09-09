import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { canSmsRecipient } from '../../common/sms-consent';
import type { AuthenticatedUser } from '../../types/auth.types';
import type { BroadcastDto } from './dto/messaging.dto';
import {
  MessagingRepository,
  type MessageTemplateRecord,
} from './messaging.repository';
import { OutboxService } from './outbox.service';

/**
 * Wording the office reaches for every year. Offered in the composer as a
 * starting point; saving one makes it the tenant's own. Ethiopian
 * observances by their common names, on the civil calendar dates the
 * client's staff and customers actually keep.
 */
export const STARTER_TEMPLATES: readonly { name: string; body: string }[] = [
  {
    name: 'Ethiopian New Year (Enkutatash)',
    body: 'Dear {{name}}, Melkam Addis Amet! Wishing you a bright and prosperous New Year from all of us at {{company}}.',
  },
  {
    name: 'Ethiopian Christmas (Genna)',
    body: 'Dear {{name}}, Melkam Gena! Merry Christmas and warm wishes from {{company}}.',
  },
  {
    name: 'Timkat',
    body: 'Dear {{name}}, Melkam Timkat! Blessings for Epiphany from {{company}}.',
  },
  {
    name: 'Eid greeting',
    body: 'Dear {{name}}, Eid Mubarak! Best wishes to you and your family from {{company}}.',
  },
  {
    name: 'Meskel',
    body: 'Dear {{name}}, Melkam Meskel! Happy Finding of the True Cross from {{company}}.',
  },
  {
    name: 'Staff announcement',
    body: '{{company}} notice: [what is happening], [when], [where]. Please confirm with the office.',
  },
  {
    name: 'Office closed',
    body: '{{company}} will be closed on [date] for [reason]. For elevator emergencies call [number].',
  },
  {
    name: 'Service visit today',
    body: 'Dear {{name}}, our technician will visit today for your scheduled elevator service. Please keep the machine room accessible.',
  },
];

export interface BroadcastResult {
  /** Tag on every outbound_messages row this broadcast produced. */
  broadcastId: string;
  audienceSize: number;
  queued: number;
  skippedNoConsent: number;
  skippedNoPhone: number;
  sendAt: string | null;
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly messagingRepository: MessagingRepository,
    private readonly outboxService: OutboxService,
  ) {}

  listTemplates(user: AuthenticatedUser): Promise<MessageTemplateRecord[]> {
    return this.messagingRepository.listTemplates(user.tenantId);
  }

  createTemplate(user: AuthenticatedUser, values: { name: string; body: string }) {
    return this.messagingRepository.createTemplate(user.tenantId, user.userId, values);
  }

  updateTemplate(user: AuthenticatedUser, id: string, patch: { name?: string; body?: string }) {
    return this.messagingRepository.updateTemplate(user.tenantId, id, patch);
  }

  deleteTemplate(user: AuthenticatedUser, id: string): Promise<void> {
    return this.messagingRepository.deleteTemplate(user.tenantId, id);
  }

  /** Who a broadcast would reach and how many would be held, without queuing anything. */
  async preview(user: AuthenticatedUser, dto: BroadcastDto): Promise<BroadcastResult> {
    return this.run(user, dto, false);
  }

  /** Queue one message per recipient; the dispatcher sends them at `sendAt` or now. */
  async broadcast(user: AuthenticatedUser, dto: BroadcastDto): Promise<BroadcastResult> {
    return this.run(user, dto, true);
  }

  private async run(
    user: AuthenticatedUser,
    dto: BroadcastDto,
    commit: boolean,
  ): Promise<BroadcastResult> {
    const sendAt = dto.sendAt ? new Date(dto.sendAt) : null;
    if (sendAt && sendAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('sendAt is in the past');
    }
    const [recipients, company] = await Promise.all([
      dto.audience === 'EMPLOYEES'
        ? this.messagingRepository.listEmployeeRecipients(user.tenantId, dto.roles)
        : this.messagingRepository.listCustomerRecipients(user.tenantId),
      this.messagingRepository.tenantName(user.tenantId),
    ]);

    const broadcastId = randomUUID();
    const result: BroadcastResult = {
      broadcastId,
      audienceSize: recipients.length,
      queued: 0,
      skippedNoConsent: 0,
      skippedNoPhone: 0,
      sendAt: sendAt ? sendAt.toISOString() : null,
    };

    for (const recipient of recipients) {
      if (!recipient.phone) {
        result.skippedNoPhone++;
        continue;
      }
      const consentAt = canSmsRecipient(recipient) ? recipient.smsConsentAt : null;
      if (!consentAt) {
        result.skippedNoConsent++;
        continue;
      }
      if (commit) {
        try {
          await this.outboxService.enqueue({
            tenantId: user.tenantId,
            channel: 'SMS',
            recipient: recipient.phone,
            body: renderTemplate(dto.body, { name: recipient.name, company }),
            dedupeKey: `broadcast:${broadcastId}:${recipient.id}`,
            subjectKind: 'BROADCAST',
            subjectId: broadcastId,
            createdByUserId: user.userId,
            consentAt,
            sendAt: sendAt ?? undefined,
          });
        } catch (err) {
          // An unparseable phone on one contact must not abort the other 199.
          // It surfaces as "no phone" here and in the log's held count.
          this.logger.warn(
            `Broadcast ${broadcastId}: skipped ${recipientKind(dto)} ${recipient.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          result.skippedNoPhone++;
          continue;
        }
      }
      result.queued++;
    }
    return result;
  }
}

const recipientKind = (dto: BroadcastDto): string =>
  dto.audience === 'EMPLOYEES' ? 'employee' : 'customer';

/** `{{name}}` and `{{company}}` only; anything else is left as typed. */
export const renderTemplate = (
  body: string,
  values: { name: string; company: string },
): string =>
  body
    .replace(/\{\{\s*name\s*\}\}/gi, values.name)
    .replace(/\{\{\s*company\s*\}\}/gi, values.company);
