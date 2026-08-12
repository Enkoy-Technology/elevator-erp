import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { Env } from '../../config';
import * as schema from '../../database/schema';
import { OutboxDispatcherRepository } from './outbox-dispatcher.repository';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OUTBOX_ADMIN_DB, OUTBOX_ADMIN_POOL, SMS_PROVIDER } from './outbox.constants';
import { OutboxRepository } from './outbox.repository';
import { OutboxService } from './outbox.service';
import { NoopSmsProvider } from './providers/noop-sms.provider';
import type { SmsProvider } from './providers/sms-provider.interface';

@Module({
  providers: [
    OutboxService,
    OutboxRepository,
    OutboxDispatcherService,
    OutboxDispatcherRepository,
    // The dispatcher's own admin-role connection — deliberately NOT part of
    // the global DatabaseModule (whose DRIZZLE/PG_POOL connect as app_user
    // and are injectable everywhere). Scoping it to this module and
    // injecting it only into OutboxDispatcherRepository keeps the
    // RLS-bypassing connection from being reachable by any controller or
    // other module — see that repository's own doc comment for the full
    // multi-tenancy reasoning.
    {
      provide: OUTBOX_ADMIN_POOL,
      useFactory: (config: ConfigService<Env, true>) => {
        const connectionString = config.get('DATABASE_ADMIN_URL', {
          infer: true,
        });
        if (!connectionString) {
          throw new Error(
            'DATABASE_ADMIN_URL must be set — the outbox dispatcher runs as the migration/admin role (see OutboxDispatcherRepository).',
          );
        }
        return new Pool({ connectionString, max: 5 });
      },
      inject: [ConfigService],
    },
    {
      provide: OUTBOX_ADMIN_DB,
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
      inject: [OUTBOX_ADMIN_POOL],
    },
    {
      provide: SMS_PROVIDER,
      // A switch of one, on purpose: SMS_PROVIDER's env schema only allows
      // 'noop' today (Task 3 adds the real adapter once the client picks
      // one, and extends both the enum and this switch together).
      useFactory: (config: ConfigService<Env, true>): SmsProvider => {
        const selected = config.get('SMS_PROVIDER', { infer: true });
        switch (selected) {
          case 'noop':
          default:
            return new NoopSmsProvider();
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [OutboxService],
})
export class OutboxModule implements OnApplicationShutdown {
  constructor(@Inject(OUTBOX_ADMIN_POOL) private readonly adminPool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.adminPool.end();
  }
}
