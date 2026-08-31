import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DATABASE_ADMIN_URL: z.string().min(1).optional(),
  /**
   * Connection string for the outbox_dispatcher role (migration
   * 0049_outbox_dispatcher_role.sql) — SELECT+UPDATE on outbound_messages
   * only, never the Postgres superuser. See
   * OutboxDispatcherRepository's own doc comment for why the dispatcher
   * uses a dedicated least-privilege role, gated by the admin_bypass RLS
   * policy, instead of DATABASE_ADMIN_URL.
   */
  OUTBOX_DISPATCHER_DATABASE_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3003'),
  /**
   * Express `trust proxy` hop count. Set to the number of reverse proxies in
   * front of the API (e.g. 1 behind a single load balancer) so throttling
   * keys on the real client IP instead of the proxy's. 0 = direct exposure.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  /**
   * Which SmsProvider adapter OutboxModule wires up — 'noop' (default, safe:
   * logs and sends nothing), or a real gateway once its credentials below are
   * set. Stays an enum (not a free string) so a typo fails fast at boot
   * instead of silently falling back to noop in production.
   */
  SMS_PROVIDER: z.enum(['noop', 'afromessage', 'geezsms']).default('noop'),
  /** Bearer token for https://api.afromessage.com/api — see AfroMessageProvider's own doc comment for the verified request/response shape. Required when SMS_PROVIDER=afromessage. */
  AFROMESSAGE_API_KEY: z.string().min(1).optional(),
  /** Optional verified Sender Name (AfroMessage's `sender` field) — omit to use the account's own default. Branding a custom name requires AfroMessage's own registration process; see the deploy runbook. */
  AFROMESSAGE_SENDER: z.string().min(1).optional(),
  /** GeezSMS's own field name for its API token (https://api.geezsms.com/api/v1/sms/send) — see GeezSmsProvider's own doc comment. Required when SMS_PROVIDER=geezsms. */
  GEEZSMS_TOKEN: z.string().min(1).optional(),
  /** Optional shortcode id (GeezSMS's `shortcode_id` field) — omit to use GeezSMS's own shared shortcode. A dedicated shortcode requires GeezSMS's own registration process; see the deploy runbook. */
  GEEZSMS_SENDER_ID: z.string().min(1).optional(),
  /**
   * Comma-separated E.164 numbers this deployment may actually SMS while
   * SMS_LIVE is not "1" (task-3 brief §3.0 SAFETY) — the structural guard
   * rail, not a promise. While not live: a real provider selected with this
   * empty refuses to boot (below); OutboxDispatcherService blocks —
   * visibly, FAILED with an explanatory lastError, never silently — any
   * recipient not on this list (see sms-allowlist.ts). Ignored entirely
   * once SMS_LIVE=1, where real customers must receive real reminders.
   */
  SMS_ALLOWLIST: z.string().default(''),
  /**
   * The ONLY switch that lets outbound SMS reach real phone numbers —
   * default off (I2). Deliberately independent of NODE_ENV: the idiomatic
   * Dockerfile for a built Node app sets NODE_ENV=production, and that is
   * exactly the Dockerfile a later deploy phase writes — the moment a
   * staging container is built the normal way, gating on NODE_ENV would
   * silently drop the allowlist and the boot refusal below, on a box that
   * may hold the client's real credentials. SMS_LIVE decouples "is this a
   * production build" from "may this box text real people": production
   * must set SMS_LIVE=1 explicitly to reach real recipients; every other
   * deployment (dev/test/staging, regardless of NODE_ENV) is
   * allowlist-gated by default. Accepts only "0" or "1" so a typo (e.g.
   * "true") fails loudly at boot instead of silently defaulting to off.
   */
  SMS_LIVE: z
    .enum(['0', '1'])
    .default('0')
    .transform((value) => value === '1'),
}).superRefine((env, ctx) => {
  // HS256 secrets shorter than the 256-bit hash weaken the whole auth chain.
  if (env.NODE_ENV === 'production' && env.JWT_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['JWT_SECRET'],
      message: 'JWT_SECRET must be at least 32 characters in production',
    });
  }
  // A provider selected without its credentials would silently boot as if
  // configured and then fail every send at runtime — the task-3 brief calls
  // a silently-noop production deployment the worst outcome, but a
  // selected-but-uncredentialed provider (fails loudly on every send instead
  // of never sending) is arguably worse: fail AT BOOT instead.
  if (env.SMS_PROVIDER === 'afromessage' && !env.AFROMESSAGE_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['AFROMESSAGE_API_KEY'],
      message: 'AFROMESSAGE_API_KEY is required when SMS_PROVIDER=afromessage',
    });
  }
  if (env.SMS_PROVIDER === 'geezsms' && !env.GEEZSMS_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['GEEZSMS_TOKEN'],
      message: 'GEEZSMS_TOKEN is required when SMS_PROVIDER=geezsms',
    });
  }
  // task-3 brief §3.0 SAFETY / I2: "a staging box with live credentials and
  // no allowlist is exactly the accident this prevents" — refuse to boot
  // rather than let a deployment with a real provider and SMS_LIVE not set
  // to "1" be able to text a real customer. Deliberately keyed on SMS_LIVE,
  // not NODE_ENV: an idiomatic Dockerfile sets NODE_ENV=production for any
  // built Node app, staging included, and that must not be enough on its
  // own to skip this refusal. SMS_LIVE=1 is exempt: the allowlist has no
  // effect once live (real customers must receive real reminders), so
  // requiring it would be a boot-time false alarm with no safety benefit.
  if (!env.SMS_LIVE && env.SMS_PROVIDER !== 'noop' && env.SMS_ALLOWLIST.trim() === '') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['SMS_ALLOWLIST'],
      message:
        `SMS_ALLOWLIST must be set when SMS_PROVIDER=${env.SMS_PROVIDER} and SMS_LIVE is not "1" — ` +
        'a deployment with live SMS credentials, SMS_LIVE unset, and no allowlist could text a real customer. ' +
        'Set SMS_ALLOWLIST to the test handset(s) this deployment may reach (e.g. SMS_ALLOWLIST=+251949922604), ' +
        'or set SMS_LIVE=1 if this deployment is authorized to reach real numbers (production only).',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  return result.data;
};
