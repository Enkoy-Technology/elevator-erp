import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../../config';
import * as schema from '../../database/schema';
import { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import {
  OUTBOX_DISPATCHER_DB,
  OUTBOX_DISPATCHER_POOL,
  SMS_PROVIDER,
} from './outbox.constants';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';
import { createSmsProvider } from './providers/sms-provider.factory';
import type { SmsProvider } from './providers/sms-provider.interface';

@Module({
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
  ],
  exports: [OutboxService],
})
export class OutboxModule implements OnApplicationShutdown {
  constructor(@Inject(OUTBOX_DISPATCHER_POOL) private readonly dispatcherPool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dispatcherPool.end();
  }
}
