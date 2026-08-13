import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

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

    for (const invoice of dueInvoices) {
      if (!invoice.customerPhone) {
        continue;
      }
      if (!canSmsRecipient({ smsConsentAt: invoice.customerSmsConsentAt })) {
        logSmsConsentSkip(this.logger, {
          tenantId,
          recipientKind: 'customer',
          recipientId: invoice.customerId,
        });
        consentSkipped++;
        continue;
      }

      const sentOk = await this.enqueueSafely({
        tenantId,
        channel: 'SMS',
        recipient: invoice.customerPhone,
        body: reminderBody(invoice),
        dedupeKey: `invoice-due:${invoice.invoiceId}:${invoice.offsetDays}`,
        subjectKind: 'INVOICE',
        subjectId: invoice.invoiceId,
      });
      if (sentOk) sent++;
    }

    await this.remindersRepository.recordConsentSkipCount(tenantId, consentSkipped);

    this.logger.log(
      `Payment reminders for tenant ${tenantId}: ${sent} sent, ${consentSkipped} skipped for consent (${dueInvoices.length} invoices due)`,
    );
  }

  private async enqueueSafely(input: EnqueueMessageInput): Promise<boolean> {
    try {
      await this.outboxService.enqueue(input);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to enqueue payment reminder SMS (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
      );
      return false;
    }
  }
}

/** Money via formatEtb, never Number() (task-2 brief §2.3). */
function reminderBody(invoice: DuePaymentReminder): string {
  return `Invoice ${invoice.invoiceNumber}: ${formatEtb(invoice.outstandingEtb)} outstanding, due ${invoice.dueDate}.`;
}
