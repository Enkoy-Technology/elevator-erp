import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InvalidPhoneNumberError, SmsConsentRequiredError } from '../../common/exceptions';
import { canSmsRecipient, logSmsConsentSkip } from '../../common/sms-consent';
import type { EnqueueMessageInput } from '../outbox/outbox.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  WarrantyReminderRepository,
  type DueWarrantyReminder,
} from './warranty-reminders.repository';
import { TenantDirectoryService } from './tenant-directory.service';

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** Same shape as MaintenanceReminderService/PaymentReminderService's own. */
type EnqueueOutcome = 'SENT' | 'NO_CONSENT' | 'INVALID_PHONE' | 'FAILED';

/**
 * "Warranty Expiration" — the fifth reminder on the client's proposal, and
 * the one PaymentReminderService's own doc comment called out as
 * unbuildable because no expiry date existed anywhere in the schema. The
 * contracts slice gave it one: `warrantyMonths` plus the handover (or
 * signing) date, resolved by the SAME `warrantyWindow` the Warranty
 * Certificate prints from, so the SMS can never name a date the customer's
 * certificate contradicts.
 *
 * Customer-only, like the payment rule: nothing links a `customers` row to
 * a `users` login, so there is no in-app inbox to also write to.
 */
@Injectable()
export class WarrantyReminderService {
  private readonly logger = new Logger(WarrantyReminderService.name);

  constructor(
    private readonly tenantDirectory: TenantDirectoryService,
    private readonly remindersRepository: WarrantyReminderRepository,
    private readonly outboxService: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyReminders(): Promise<void> {
    const tenantIds = await this.tenantDirectory.listActiveTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await this.remindOneTenant(tenantId);
      } catch (err) {
        this.logger.error(
          `Warranty reminders failed for tenant ${tenantId}: ${errorMessage(err)}`,
        );
      }
    }
  }

  private async remindOneTenant(tenantId: string): Promise<void> {
    const expiring =
      await this.remindersRepository.listExpiringWarranties(tenantId);
    let sent = 0;
    let consentSkipped = 0;
    let invalidPhoneSkipped = 0;

    for (const contract of expiring) {
      if (!contract.customerPhone) {
        continue;
      }

      const outcome = await this.enqueueSafely({
        tenantId,
        channel: 'SMS',
        recipient: contract.customerPhone,
        body: reminderBody(contract),
        // offsetDays is part of the key so the 30-day notice and the 7-day
        // notice are two different messages, and re-running the cron on the
        // same day is a no-op (the outbox swallows a repeat key).
        dedupeKey: `warranty-expiry:${contract.contractId}:${contract.offsetDays}`,
        subjectKind: 'CONTRACT',
        subjectId: contract.contractId,
        // The consent choke point is OutboxService.enqueue; this only
        // decides what to hand it — a never-consented OR later-revoked
        // customer both resolve to null here.
        consentAt: canSmsRecipient({
          smsConsentAt: contract.customerSmsConsentAt,
          smsConsentRevokedAt: contract.customerSmsConsentRevokedAt,
        })
          ? contract.customerSmsConsentAt
          : null,
      });

      if (outcome === 'SENT') {
        sent++;
      } else if (outcome === 'NO_CONSENT') {
        logSmsConsentSkip(this.logger, {
          tenantId,
          recipientKind: 'customer',
          recipientId: contract.customerId,
        });
        consentSkipped++;
      } else if (outcome === 'INVALID_PHONE') {
        invalidPhoneSkipped++;
      }
    }

    // No recordRunResult here, unlike the other two rules: the `tenants`
    // counter columns are per-rule (maintenanceReminder*/paymentReminder*)
    // and this slice's schema is frozen.
    // ponytail: log line only. Add warranty_reminder_consent_skipped_count
    // alongside the existing pairs when a migration next touches `tenants`,
    // and call a recordRunResult exactly like the other two.
    this.logger.log(
      `Warranty reminders for tenant ${tenantId}: ${sent} sent, ${consentSkipped} skipped for consent, ` +
        `${invalidPhoneSkipped} skipped for invalid phone (${expiring.length} warranties expiring)`,
    );
  }

  private async enqueueSafely(input: EnqueueMessageInput): Promise<EnqueueOutcome> {
    try {
      await this.outboxService.enqueue(input);
      return 'SENT';
    } catch (err) {
      if (err instanceof SmsConsentRequiredError) {
        return 'NO_CONSENT';
      }
      if (err instanceof InvalidPhoneNumberError) {
        this.logger.error(
          `Skipped warranty reminder SMS for an invalid stored phone number (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
        );
        return 'INVALID_PHONE';
      }
      this.logger.error(
        `Failed to enqueue warranty reminder SMS (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
      );
      return 'FAILED';
    }
  }
}

/**
 * One segment of GSM-7 for a typical contract number and customer name —
 * the equipment description is deliberately left off: it belongs on the
 * certificate, and every extra character here is a second billed segment.
 */
function reminderBody(contract: DueWarrantyReminder): string {
  return `Warranty on contract ${contract.contractNumber} expires ${contract.expiresOn} (in ${contract.offsetDays} days). Contact us to arrange a service agreement.`;
}
