import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InvalidPhoneNumberError, SmsConsentRequiredError } from '../../common/exceptions';
import { formatEtb } from '../../common/export/templates/money-format';
import { canSmsRecipient, logSmsConsentSkip } from '../../common/sms-consent';
import type { EnqueueMessageInput } from '../outbox/outbox.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  PaymentReminderRepository,
  type DuePaymentReminder,
} from './payment-reminders.repository';
import { TenantDirectoryService } from './tenant-directory.service';

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** What `enqueueSafely` actually did — same shape as
 * MaintenanceReminderService's own (2nd occurrence, duplicated per this
 * codebase's established convention rather than shared). */
type EnqueueOutcome = 'SENT' | 'NO_CONSENT' | 'INVALID_PHONE' | 'FAILED';

/**
 * Task-2 brief §2.3 (plan 4.8, deferred from Phase 4): daily per-tenant
 * payment-reminder cron. Implements only what today's schema actually
 * supports — invoices past/at their dueDate and still outstanding.
 *
 * Warranty expiry and advance-payment reminders (also on the client PDF's
 * list) are deliberately NOT implemented: neither fact has a schema field
 * to read today (no warranty date on `assets`/`maintenanceContracts`, no
 * scheduled-advance-amount concept anywhere) — see this task's own report
 * for the honest call-out rather than a half-built approximation.
 *
 * No in-app notification for this rule, unlike §2.2's maintenance reminder:
 * the recipient is always a customer, and nothing links a `customers` row to
 * a `users` login, so there is no inbox to put anything in.
 */
@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    private readonly tenantDirectory: TenantDirectoryService,
    private readonly remindersRepository: PaymentReminderRepository,
    private readonly outboxService: OutboxService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async runDailyReminders(): Promise<void> {
    const tenantIds = await this.tenantDirectory.listActiveTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await this.remindOneTenant(tenantId);
      } catch (err) {
        this.logger.error(
          `Payment reminders failed for tenant ${tenantId}: ${errorMessage(err)}`,
        );
      }
    }
  }

  private async remindOneTenant(tenantId: string): Promise<void> {
    const dueInvoices = await this.remindersRepository.listDueInvoices(tenantId);
    let sent = 0;
    let consentSkipped = 0;
    let invalidPhoneSkipped = 0;

    for (const invoice of dueInvoices) {
      if (!invoice.customerPhone) {
        continue;
      }

      const outcome = await this.enqueueSafely({
        tenantId,
        channel: 'SMS',
        recipient: invoice.customerPhone,
        body: reminderBody(invoice),
        dedupeKey: `invoice-due:${invoice.invoiceId}:${invoice.offsetDays}`,
        subjectKind: 'INVOICE',
        subjectId: invoice.invoiceId,
        // I3: consentAt is resolved via canSmsRecipient (which now also
        // accounts for a later revoke — I10) right here at the call site;
        // OutboxService.enqueue is the actual choke point that refuses on
        // null, this only decides what to hand it.
        consentAt: canSmsRecipient({
          smsConsentAt: invoice.customerSmsConsentAt,
          smsConsentRevokedAt: invoice.customerSmsConsentRevokedAt,
        })
          ? invoice.customerSmsConsentAt
          : null,
      });

      if (outcome === 'SENT') {
        sent++;
      } else if (outcome === 'NO_CONSENT') {
        logSmsConsentSkip(this.logger, {
          tenantId,
          recipientKind: 'customer',
          recipientId: invoice.customerId,
        });
        consentSkipped++;
      } else if (outcome === 'INVALID_PHONE') {
        invalidPhoneSkipped++;
      }
    }

    await this.remindersRepository.recordRunResult(
      tenantId,
      consentSkipped,
      invalidPhoneSkipped,
    );

    this.logger.log(
      `Payment reminders for tenant ${tenantId}: ${sent} sent, ${consentSkipped} skipped for consent, ` +
        `${invalidPhoneSkipped} skipped for invalid phone (${dueInvoices.length} invoices due)`,
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
        // I4: expected to be rare going forward (phone format is now
        // validated at write time) — a number stored before that
        // validation shipped can still land here.
        this.logger.error(
          `Skipped payment reminder SMS for an invalid stored phone number (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
        );
        return 'INVALID_PHONE';
      }
      this.logger.error(
        `Failed to enqueue payment reminder SMS (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
      );
      return 'FAILED';
    }
  }
}

/** Money via formatEtb, never Number() (task-2 brief §2.3). */
function reminderBody(invoice: DuePaymentReminder): string {
  return `Invoice ${invoice.invoiceNumber}: ${formatEtb(invoice.outstandingEtb)} outstanding, due ${invoice.dueDate}.`;
}
