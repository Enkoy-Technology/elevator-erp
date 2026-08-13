import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { InvalidPhoneNumberError, SmsConsentRequiredError } from '../../common/exceptions';
import { canSmsRecipient, logSmsConsentSkip } from '../../common/sms-consent';
import type { CreateNotificationDto } from '../notifications/dto/notification.dto';
import { NotificationsRepository } from '../notifications/notifications.repository';
import type { EnqueueMessageInput } from '../outbox/outbox.service';
import { OutboxService } from '../outbox/outbox.service';
import {
  MaintenanceReminderRepository,
  type DueMaintenanceReminder,
} from './maintenance-reminders.repository';
import { TenantDirectoryService } from './tenant-directory.service';

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

/** What `enqueueSafely` actually did, so each call site can bump the right
 * per-run counter without re-deriving it from a caught error itself (I3/I4). */
type EnqueueOutcome = 'SENT' | 'NO_CONSENT' | 'INVALID_PHONE' | 'FAILED';

/**
 * Task-2 brief §2.2: the daily per-tenant maintenance-contract reminder cron,
 * plus the immediate (not cron) breakdown-assignment notification called by
 * MaintenanceService right after a breakdown gets an assignedUserId. Both
 * paths enqueue through OutboxService (SMS, consent-gated — see
 * `common/sms-consent.ts`) and NotificationsRepository (in-app, NOT
 * consent-gated — §2.1's consent rule is an SMS-channel rule, not an in-app
 * one) independently: one failing must never prevent the other (§2.4).
 *
 * In-app notifications only reach a technician (a real `users` row) — a
 * courtesy SMS to a customer has no in-app equivalent today, since nothing
 * links a `customers` row to a `users` login (see this task's own report).
 */
@Injectable()
export class MaintenanceReminderService {
  private readonly logger = new Logger(MaintenanceReminderService.name);

  constructor(
    private readonly tenantDirectory: TenantDirectoryService,
    private readonly remindersRepository: MaintenanceReminderRepository,
    private readonly outboxService: OutboxService,
    private readonly notificationsRepository: NotificationsRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailyReminders(): Promise<void> {
    const tenantIds = await this.tenantDirectory.listActiveTenantIds();
    for (const tenantId of tenantIds) {
      try {
        await this.remindOneTenant(tenantId);
      } catch (err) {
        this.logger.error(
          `Maintenance reminders failed for tenant ${tenantId}: ${errorMessage(err)}`,
        );
      }
    }
  }

  private async remindOneTenant(tenantId: string): Promise<void> {
    const { windowDays, contracts } =
      await this.remindersRepository.listDueContracts(tenantId);
    let technicianSent = 0;
    let customerSent = 0;
    let consentSkipped = 0;
    let invalidPhoneSkipped = 0;

    for (const contract of contracts) {
      if (contract.technicianId) {
        if (contract.technicianPhone) {
          const outcome = await this.enqueueSafely({
            tenantId,
            channel: 'SMS',
            recipient: contract.technicianPhone,
            body: technicianBody(contract),
            // Includes the technician id (nit fix) — without it, reassigning
            // a contract before the service date reuses the SAME dedupeKey
            // the old technician already consumed, and the outbox's own
            // dedupe swallow (task-1) then silently drops the new
            // technician's reminder. Mirrors notifyBreakdownAssigned's own
            // `breakdown:<id>:<assigneeId>` key below, which already
            // includes it.
            dedupeKey: `maint:${contract.contractId}:${contract.nextServiceAt}:technician:${contract.technicianId}`,
            subjectKind: 'MAINTENANCE_CONTRACT',
            subjectId: contract.contractId,
            consentAt: effectiveConsentAt({
              smsConsentAt: contract.technicianSmsConsentAt,
              smsConsentRevokedAt: contract.technicianSmsConsentRevokedAt,
            }),
          });
          if (outcome === 'SENT') {
            technicianSent++;
          } else if (outcome === 'NO_CONSENT') {
            logSmsConsentSkip(this.logger, {
              tenantId,
              recipientKind: 'technician',
              recipientId: contract.technicianId,
            });
            consentSkipped++;
          } else if (outcome === 'INVALID_PHONE') {
            invalidPhoneSkipped++;
          }
        }

        await this.notifySafely(tenantId, contract.technicianId, {
          type: 'MAINTENANCE',
          title: `Maintenance due ${contract.nextServiceAt}`,
          body: technicianBody(contract),
          // Doubles as this notification's own dedupe identity (this table
          // has no dedupeKey column — see NotificationsRepository.
          // existsByLinkPath's own doc comment) — the cron runs once per day
          // for every day the contract sits inside the window, so without
          // `nextServiceAt` in the path the September notification would
          // suppress October's, November's, and every cycle after that,
          // forever (C3). Mirrors the SMS dedupeKey above, which already
          // includes it.
          linkPath: `/maintenance?contract=${contract.contractId}&due=${contract.nextServiceAt}`,
        });
      }

      if (contract.customerPhone) {
        const outcome = await this.enqueueSafely({
          tenantId,
          channel: 'SMS',
          recipient: contract.customerPhone,
          body: customerBody(contract),
          dedupeKey: `maint:${contract.contractId}:${contract.nextServiceAt}:customer`,
          subjectKind: 'MAINTENANCE_CONTRACT',
          subjectId: contract.contractId,
          consentAt: effectiveConsentAt({
            smsConsentAt: contract.customerSmsConsentAt,
            smsConsentRevokedAt: contract.customerSmsConsentRevokedAt,
          }),
        });
        if (outcome === 'SENT') {
          customerSent++;
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
    }

    await this.remindersRepository.recordRunResult(
      tenantId,
      consentSkipped,
      invalidPhoneSkipped,
    );

    this.logger.log(
      `Maintenance reminders for tenant ${tenantId}: ${technicianSent} technician SMS, ` +
        `${customerSent} customer SMS, ${consentSkipped} skipped for consent, ` +
        `${invalidPhoneSkipped} skipped for invalid phone ` +
        `(window ${windowDays}d, ${contracts.length} contracts due)`,
    );
  }

  /**
   * Fired synchronously by MaintenanceService right after a breakdown
   * create/update leaves it with an assignedUserId — never a cron (task-2
   * brief §2.2). dedupeKey `breakdown:<id>:<assigneeId>` is what makes
   * calling this on EVERY write safe, not just on an actual reassignment:
   * the outbox's own dedupe swallow (task-1) turns "reassign to the same
   * person" into a no-op and "reassign to someone new" into a fresh key —
   * this method doesn't need to diff old vs new itself. Never throws: a
   * reminder failure must not fail the breakdown write that triggered it.
   */
  async notifyBreakdownAssigned(
    tenantId: string,
    breakdownId: string,
  ): Promise<void> {
    try {
      const info = await this.remindersRepository.getBreakdownAssignmentInfo(
        tenantId,
        breakdownId,
      );
      if (!info || !info.assignedUserId) {
        return;
      }
      const body = `New breakdown assigned: ${info.title} at ${info.customerName} (${info.assetName}). Severity: ${info.severity}.`;

      if (info.technicianPhone) {
        const outcome = await this.enqueueSafely({
          tenantId,
          channel: 'SMS',
          recipient: info.technicianPhone,
          body,
          dedupeKey: `breakdown:${breakdownId}:${info.assignedUserId}`,
          subjectKind: 'BREAKDOWN',
          subjectId: breakdownId,
          consentAt: effectiveConsentAt({
            smsConsentAt: info.technicianSmsConsentAt,
            smsConsentRevokedAt: info.technicianSmsConsentRevokedAt,
          }),
        });
        // INVALID_PHONE/FAILED are already logged inside enqueueSafely;
        // NO_CONSENT is the one outcome this caller still has to log itself
        // (no per-run counter here — this path isn't a cron batch).
        if (outcome === 'NO_CONSENT') {
          logSmsConsentSkip(this.logger, {
            tenantId,
            recipientKind: 'technician',
            recipientId: info.assignedUserId,
          });
        }
      }

      await this.notifySafely(tenantId, info.assignedUserId, {
        type: 'ASSIGNMENT',
        title: `Breakdown assigned: ${info.title}`,
        body,
        // Assignee is part of the path on purpose: reassigning to someone
        // ELSE must still notify them, matching the outbox dedupeKey's own
        // `breakdown:<id>:<assigneeId>` granularity above.
        linkPath: `/maintenance?breakdown=${breakdownId}&assignee=${info.assignedUserId}`,
      });
    } catch (err) {
      this.logger.error(
        `Breakdown-assignment reminder failed for breakdown ${breakdownId}: ${errorMessage(err)}`,
      );
    }
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
        // I4: this is now expected to be rare (phone format is validated at
        // write time), but a number stored before that validation shipped
        // can still land here — visible in the log (masked, never a full
        // number) and counted, not silent.
        this.logger.error(
          `Skipped SMS for an invalid stored phone number (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
        );
        return 'INVALID_PHONE';
      }
      this.logger.error(
        `Failed to enqueue reminder SMS (dedupeKey ${input.dedupeKey}): ${errorMessage(err)}`,
      );
      return 'FAILED';
    }
  }

  private async notifySafely(
    tenantId: string,
    userId: string,
    dto: Omit<CreateNotificationDto, 'userId'> & { type: 'MAINTENANCE' | 'ASSIGNMENT'; linkPath: string },
  ): Promise<void> {
    try {
      const alreadyNotified = await this.notificationsRepository.existsByLinkPath(
        tenantId,
        userId,
        dto.type,
        dto.linkPath,
      );
      if (alreadyNotified) {
        return;
      }
      await this.notificationsRepository.create(tenantId, null, { userId, ...dto });
    } catch (err) {
      this.logger.error(
        `Failed to create in-app notification for user ${userId}: ${errorMessage(err)}`,
      );
    }
  }
}

/**
 * The recipient's consent timestamp if — and only if — `canSmsRecipient`
 * says they're currently entitled (never consented, or consented and later
 * revoked, both read null); `EnqueueMessageInput.consentAt` for the SMS
 * channel (I3) — `OutboxService.enqueue` is the actual choke point that
 * refuses on null, this only computes what to hand it.
 */
function effectiveConsentAt(recipient: {
  smsConsentAt: Date | null;
  smsConsentRevokedAt: Date | null;
}): Date | null {
  return canSmsRecipient(recipient) ? recipient.smsConsentAt : null;
}

function technicianBody(contract: DueMaintenanceReminder): string {
  const siteSuffix = contract.site ? `, ${contract.site}` : '';
  return `Maintenance visit due ${contract.nextServiceAt}: ${contract.assetName} at ${contract.customerName}${siteSuffix}.`;
}

function customerBody(contract: DueMaintenanceReminder): string {
  return `Reminder: scheduled maintenance for ${contract.assetName} on ${contract.nextServiceAt}.`;
}
