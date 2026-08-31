import {
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../../config';
import * as schema from '../../database/schema';
import { OutboxController } from './outbox.controller';
import { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import {
  OUTBOX_DISPATCHER_DB,
  OUTBOX_DISPATCHER_POOL,
  SMS_ALLOWLIST_CONFIG,
  SMS_PROVIDER,
} from './outbox.constants';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';
import { createSmsProvider } from './providers/sms-provider.factory';
import type { SmsProvider } from './providers/sms-provider.interface';
import { parseSmsAllowlist, type SmsAllowlistRuntimeConfig } from './sms-allowlist';

@Module({
  controllers: [OutboxController],
  providers: [
    OutboxService,
    OutboxRepository,
    OutboxDispatcherService,
    OutboxDispatcherRepository,
    // The dispatcher's own connection — deliberately NOT part of the global
    // DatabaseModule (whose DRIZZLE/PG_POOL connect as app_user and are
    // injectable everywhere), and deliberately NOT the Postgres superuser
    // either: it connects as `outbox_dispatcher` (migration
    // 0049_outbox_dispatcher_role.sql), a role with exactly SELECT+UPDATE
    // on outbound_messages and nothing else. Scoping it to this module and
    // injecting it only into OutboxDispatcherRepository keeps this
    // connection from being reachable by any controller or other module —
    // see that repository's own doc comment for the full multi-tenancy
    // reasoning.
    {
      provide: OUTBOX_DISPATCHER_POOL,
      useFactory: (config: ConfigService<Env, true>) => {
        const connectionString = config.get('OUTBOX_DISPATCHER_DATABASE_URL', {
          infer: true,
        });
        if (!connectionString) {
          throw new Error(
            'OUTBOX_DISPATCHER_DATABASE_URL must be set — the outbox dispatcher connects as the least-privilege outbox_dispatcher role (see OutboxDispatcherRepository, migration 0049_outbox_dispatcher_role.sql).',
          );
        }
        return new Pool({ connectionString, max: 5 });
      },
      inject: [ConfigService],
    },
    {
      provide: OUTBOX_DISPATCHER_DB,
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
      inject: [OUTBOX_DISPATCHER_POOL],
    },
    {
      provide: SMS_PROVIDER,
      // Selection logic lives in createSmsProvider (own unit tests, no Nest
      // DI needed) — including "fail loudly without credentials", which the
      // env schema's own superRefine also already enforces at
      // ConfigModule.forRoot boot time, before this factory ever runs; the
      // throw inside createSmsProvider is defense in depth, matching
      // OUTBOX_DISPATCHER_POOL's own throw-if-missing pattern above.
      useFactory: (config: ConfigService<Env, true>): SmsProvider =>
        createSmsProvider({
          SMS_PROVIDER: config.get('SMS_PROVIDER', { infer: true }),
          AFROMESSAGE_API_KEY: config.get('AFROMESSAGE_API_KEY', { infer: true }),
          AFROMESSAGE_SENDER: config.get('AFROMESSAGE_SENDER', { infer: true }),
          GEEZSMS_TOKEN: config.get('GEEZSMS_TOKEN', { infer: true }),
          GEEZSMS_SENDER_ID: config.get('GEEZSMS_SENDER_ID', { infer: true }),
        }),
      inject: [ConfigService],
    },
    {
      provide: SMS_ALLOWLIST_CONFIG,
      // Parsed once at boot, not on every dispatch — env doesn't change at
      // runtime. Injected as a plain value (not ConfigService itself) so
      // OutboxDispatcherService stays constructible in a unit test with a
      // plain object literal, same shape as SMS_PROVIDER above.
      useFactory: (config: ConfigService<Env, true>): SmsAllowlistRuntimeConfig => ({
        smsLive: config.get('SMS_LIVE', { infer: true }),
        allowlist: parseSmsAllowlist(config.get('SMS_ALLOWLIST', { infer: true })),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule implements OnApplicationShutdown, OnModuleInit {
  private readonly logger = new Logger(OutboxModule.name);

  constructor(
    @Inject(OUTBOX_DISPATCHER_POOL) private readonly dispatcherPool: Pool,
    @Inject(SMS_ALLOWLIST_CONFIG) private readonly allowlistConfig: SmsAllowlistRuntimeConfig,
  ) {}

  /**
   * task-3 brief §3.0 SAFETY / I2: "log at startup which mode is active, so
   * nobody is guessing" — whether the allowlist is enforced, ignored (live),
   * or moot (empty, not live, only reachable with SMS_PROVIDER=noop since a
   * real provider with an empty allowlist already refused to boot via
   * env.schema.ts's superRefine). Keyed on SMS_LIVE, not NODE_ENV — see
   * sms-allowlist.ts's own doc comment for why.
   */
  onModuleInit(): void {
    const { smsLive, allowlist } = this.allowlistConfig;
    if (smsLive) {
      this.logger.log(
        'SMS allowlist: IGNORED (SMS_LIVE=1) — outbound SMS reaches real recipients.',
      );
    } else if (allowlist.length === 0) {
      this.logger.log(
        'SMS allowlist: not enforced — empty (SMS_LIVE=0, SMS_PROVIDER must be noop here or boot would already have failed).',
      );
    } else {
      this.logger.log(
        `SMS allowlist: ENFORCED (SMS_LIVE=0) — only ${allowlist.length} number(s) may receive SMS; every other recipient is blocked and marked FAILED.`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.dispatcherPool.end();
  }
}
