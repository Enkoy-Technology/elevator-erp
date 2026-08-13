import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { MAX_ATTEMPTS, backoffDelayMs } from './outbox-backoff';
import { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { SMS_ALLOWLIST_CONFIG, SMS_PROVIDER } from './outbox.constants';
import type { OutboundMessageRecord } from './outbox.repository';
import type { SmsProvider } from './providers/sms-provider.interface';
import { smsAllowlistBlockReason, type SmsAllowlistRuntimeConfig } from './sms-allowlist';

const CLAIM_BATCH_SIZE = 20;

const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);

  constructor(
    private readonly dispatcherRepository: OutboxDispatcherRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
    @Inject(SMS_ALLOWLIST_CONFIG) private readonly allowlistConfig: SmsAllowlistRuntimeConfig,
  ) {}

  /**
   * ponytail: a cron plus a claim query is the right size for hundreds of
   * messages a month (task brief 5.2) — CLAUDE.md already records Redis/
   * BullMQ as removed for being unused, and standing up a real queue for
   * this volume would be solving a problem the client doesn't have yet.
   * `FOR UPDATE SKIP LOCKED` already makes multiple API instances running
   * this same cron safe, so multi-instance alone isn't the upgrade trigger
   * — a sustained backlog this claim size can't clear in a minute is. Move
   * to a real queue (or a dedicated worker process) when that happens.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async dispatch(): Promise<void> {
    let claimed: OutboundMessageRecord[];
    try {
      claimed = await this.dispatcherRepository.claimDue(CLAIM_BATCH_SIZE);
    } catch (err) {
      // A claim-query failure (a momentary DB blip) must not kill the
      // scheduler either — it just tries again next minute.
      this.logger.error(`Failed to claim due outbound messages: ${errorMessage(err)}`);
      return;
    }

    for (const message of claimed) {
      // Never let one message's provider exception escape and take the
      // rest of the batch (or the scheduler) down with it.
      await this.sendOne(message);
    }
  }

  private async sendOne(message: OutboundMessageRecord): Promise<void> {
    try {
      if (message.channel !== 'SMS') {
        // EMAIL has no producer or provider yet (task brief: "email is a
        // later consumer") — nothing enqueues one today, but a claimed row
        // still needs to be resolved rather than left in SENDING forever.
        throw new Error(`No provider configured for channel ${message.channel}`);
      }

      // The allowlist guard rail (task-3 brief §3.0 SAFETY) — checked
      // before the provider is ever called, so a non-allowlisted recipient
      // outside production physically cannot reach a real gateway.
      const blockReason = smsAllowlistBlockReason(
        this.allowlistConfig.nodeEnv,
        this.allowlistConfig.allowlist,
        message.recipient,
      );
      if (blockReason) {
        await this.blockByAllowlist(message, blockReason);
        return;
      }

      const result = await this.smsProvider.send(message.recipient, message.body);
      await this.confirmSent(message, result.providerMessageId);
    } catch (err) {
      await this.recordFailure(message, errorMessage(err));
    }
  }

  /**
   * C1 fix: `send()` returning successfully is the durability boundary — an
   * SMS that already reached a real customer must never be retried just
   * because writing that fact down failed (DB restart, pool exhaustion; the
   * dispatcher pool is `max: 5` and this client's site loses power ~39
   * times/month). This method deliberately swallows its own error instead of
   * letting it reach sendOne's catch: falling through to recordFailure would
   * put the row back to QUEUED with a 1-minute backoff, and the next tick
   * would send the SAME SMS again — indistinguishable in the log from an
   * ordinary provider failure. A row stranded in SENDING (recovered later by
   * C2's stale-claim reclaim, not by this method) is strictly better than an
   * unsolicited duplicate.
   */
  private async confirmSent(
    message: OutboundMessageRecord,
    providerMessageId: string,
  ): Promise<void> {
    try {
      await this.dispatcherRepository.markSent(
        message.tenantId,
        message.id,
        providerMessageId,
        this.smsProvider.name,
      );
    } catch (err) {
      this.logger.error(
        `Outbound message ${message.id} to ${message.recipient} was SENT successfully but recording ` +
          `that failed — leaving it in SENDING rather than retrying, to avoid re-sending an SMS that ` +
          `already reached the recipient: ${errorMessage(err)}`,
      );
    }
  }

  /**
   * A message blocked by SMS_ALLOWLIST goes straight to FAILED — never
   * through recordFailure's attempt-based backoff, since retrying later
   * won't change which numbers are allowlisted, and the brief requires the
   * block to be visible immediately (task-3 brief §3.0: "never silently
   * dropped"), not only after MAX_ATTEMPTS retries have burned down.
   */
  private async blockByAllowlist(
    message: OutboundMessageRecord,
    reason: string,
  ): Promise<void> {
    this.logger.warn(
      `Outbound message ${message.id} blocked by SMS_ALLOWLIST (recipient not on the non-production allowlist)`,
    );
    try {
      await this.dispatcherRepository.markFailed(message.tenantId, message.id, reason);
    } catch (err) {
      // Same "write-back itself failed" shape as recordFailure's own catch
      // below — log and move on rather than crash the batch or scheduler.
      this.logger.error(
        `Failed to record allowlist block for outbound message ${message.id}: ${errorMessage(err)}`,
      );
    }
  }

  /** attempts already reflects this try (claimDue increments it atomically at claim time). */
  private async recordFailure(
    message: OutboundMessageRecord,
    detail: string,
  ): Promise<void> {
    try {
      if (message.attempts >= MAX_ATTEMPTS) {
        await this.dispatcherRepository.markFailed(message.tenantId, message.id, detail);
      } else {
        const nextAttemptAt = new Date(Date.now() + backoffDelayMs(message.attempts));
        await this.dispatcherRepository.markRetry(
          message.tenantId,
          message.id,
          nextAttemptAt,
          detail,
        );
      }
    } catch (err) {
      // Recording the outcome itself failed (DB blip) — log and move on
      // rather than crashing the batch or the scheduler.
      // ponytail: a message can be left stuck in SENDING with no automatic
      // way back to QUEUED — claimDue only reclaims QUEUED rows. This isn't
      // only the rare double-failure this catch block guards against
      // (provider call AND the write-back both failing): claimDue commits
      // the whole batch to SENDING up front, before dispatch() sends any of
      // them, so an ordinary process crash mid-batch (the exact scenario
      // this feature exists for — office power cuts ~39 times/month) leaves
      // every not-yet-processed message in that batch stuck the same way,
      // no double failure required. Add a "SENDING longer than N minutes ->
      // QUEUED" reclaim sweep to claimDue if this is observed in practice
      // (flagged in code review, deferred: the brief for this task doesn't
      // ask for it and the message-log UI to even notice a stuck row
      // doesn't exist yet either).
      this.logger.error(
        `Failed to record outcome for outbound message ${message.id}: ${errorMessage(err)}`,
      );
    }
  }
}
