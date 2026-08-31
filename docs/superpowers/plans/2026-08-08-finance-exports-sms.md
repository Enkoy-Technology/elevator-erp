# Finance + Exports + SMS Implementation Plan (Master)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Scope note:** This master plan covers seven subsystems. Per the writing-plans
> scope check, each phase gets its own detailed executable plan at kickoff
> (`docs/superpowers/plans/2026-08-XX-phase-N-*.md`). Phase 1 is fully detailed
> below as the first executable plan; later phases are specified at task level
> with locked interfaces so the detailed plans cannot drift.

**Goal:** Deliver the client-promised Finance module, full export suite (CSV/Excel/PDF/Word), and SMS notifications on the existing NestJS stack, and close the gap to production deployment at Shining Star.

**Architecture:** Everything extends the current NestJS 11 + Drizzle + Postgres-RLS multi-tenant system (platform decision: `docs/planning/DECISIONS-platform-and-ethiopian-compliance.md` §1 — no rebuild). Finance is a parallel internal book, not a legal tax document (§4). Rates are effective-dated data, never constants. Documents render via the resurrected Puppeteer HTML→PDF pipeline (built in `441f07f`, removed in `f0fea5c` — restore, don't rewrite).

**Tech Stack:** NestJS 11, TypeScript strict, Drizzle ORM, Postgres 16 RLS, decimal.js, Puppeteer (PDF), ExcelJS (Excel), docx (Word), @nestjs/schedule (cron), Next.js 15 admin UI.

## Global Constraints

Every task implicitly includes these. Copied from CLAUDE.md and the decisions doc.

- Money: `numeric(14,2)` in Postgres, `decimal.js` in TS. Never float. Currency ETB.
- Tenant-scoped tables: composite PK `(tenant_id, id)`, RLS policy, tenant_id from `app.tenant_id` set_config. Never bypass RLS.
- Tax/statutory rates come from the `rate_tables` module (Phase 1). **No tax rate may appear as a code constant.** Every posted document stores the rate-version id that priced it.
- Invoices/receipts are **internal records**, not legal fiscal documents. The five nullable fiscal columns (Phase 4, Task 4.1) are the only Directive-1142/2026 hedge. Do not build clearance/IRN/QR integration — no spec exists.
- List endpoints return `{ items, page, pageSize, total, totalPages }`; query `page` (1-based), `pageSize` (default 20, max 100).
- Ethiopic text: normalize homophones on write and on search (Phase 2, Task 2.6). PDFs embed Noto Sans Ethiopic — standard PDF fonts have no Ge'ez glyphs and Amharic renders as boxes.
- Named exports only. DTOs with class-validator. Repository pattern. No raw SQL in services/controllers. Domain errors propagate to the global RFC 7807 filter.
- Immutable ledgers (inventory pattern applies to finance): never delete or update posted rows, only reversing entries.
- Deployment target: client's LAN server in Addis Ababa (Docker Compose). Must keep working with no internet (power/network outages ~39/month). Data on the client's own premises also satisfies Art 22 data residency.
- Never commit `.env` or secrets. Conventional commits. `pnpm test` green before every commit.

## Phase map

| # | Phase | Effort | Blocked by |
|---|---|---|---|
| 0 | Production hardening (from 2026-08-08 readiness audit) | 3–5d | — |
| 1 | Effective-dated rate tables + fiscal calendar | 1w | — |
| 2 | Export engine: CSV/Excel on lists, PDF/Word documents | 1.5–2w | — (docs need P3 data to be useful) |
| 3 | Quotations + Proforma resurrection | 1–1.5w | P2 (PDF pipeline) |
| 4 | Finance core: AR, payments, expenses, banks | 3–4w | P1, P3 |
| 5 | SMS channel + reminder scheduler | 1–2w | — (paperwork starts day 1) |
| 6 | GL + financial reports | 3–4w | P4 |
| 7 | Deployment: LAN install, backups, outage hardening | 1–2w | P0 |

Client-blocking inputs (not code, start immediately):
1. **SMS sender-ID / provider account paperwork** — longest lead time in the whole plan (Phase 5 note).
2. **Photograph the client's current legal documents** (ETR receipt, VAT invoice, withholding receipt, payroll slip) — fixes the exact fields of the parallel book before Phase 4 schema freezes.
3. **Client's answer on internet availability at the office** — decides the SMS provider adapter (§ Phase 5 evaluation).
4. **The additional client information from the user's pasted text** — not yet received; fold into the relevant phase plan when it arrives.

---

## Phase 0 — Production hardening

Fix the readiness-audit findings before shipping anything new. The audit report
(same date as this plan) is the source; the standing items already known:

### Task 0.1: Server config hardening

**Files:**
- Modify: `src/config/env.validation.ts` (or equivalent config schema)
- Modify: `.env.example`

- [ ] Require `TRUST_PROXY_HOPS` explicitly in config validation; document in `.env.example`
- [ ] Generate and document a distinct production `app_user` DB password (currently dev default)
- [ ] Require `JWT_SECRET` with minimum length 32 in config validation; fail startup if unset
- [ ] Commit: `fix(config): fail fast on missing production secrets`

### Task 0.2: Web lint coverage

**Files:**
- Create: `web/eslint.config.mjs` (extend root flat config for `web/src/**/*.{ts,tsx}`)
- Modify: `web/package.json` (working `lint` script; `next lint` is deprecated on Next 15)

- [ ] Add flat ESLint config for web, run `pnpm --dir web lint`, fix or annotate violations
- [ ] Commit: `chore(web): lint the admin UI like the API`

### Task 0.3: Security audit findings (2026-08-08 audit — verdict MEDIUM, no criticals)

HIGH (deploy blockers):
- [ ] **Seed guard**: `src/database/seed.ts:32-54` creates `ceo@demo.example.com` / `Demo!Passw0rd` as an ACTIVE tenant with no production gate. Add `if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') throw`. Also remove the demo password from the `LoginDto` `@ApiProperty` example.
- [ ] **`app_user` password**: migration `0001_rls_policies.sql` hardcodes `CREATE ROLE app_user LOGIN PASSWORD 'app_password'`. Cannot edit committed migrations — instead: deploy runbook step to pre-create `app_user` with a strong password before first migrate (the `IF NOT EXISTS` then skips), plus a post-migrate `ALTER ROLE app_user PASSWORD` verification step in the Phase 7 runbook.

MEDIUM:
- [ ] **`linkPath` href validation**: `create-notification.dto.ts` — add `@Matches(/^\/[a-zA-Z0-9/_?=&-]*$/)` so notification links are in-app relative paths only (today any role that can notify can phish an ADMIN with an external URL).
- [ ] **Swagger gate**: `src/main.ts:50-82` — disable `/docs` when `NODE_ENV === 'production'`.
- [ ] **Security headers**: `app.use(helmet())` on the API; `headers()` in `web/next.config.ts` (HSTS + CSP). CSP matters doubly because tokens live in localStorage.
- [ ] localStorage → httpOnly-cookie refresh token: roadmap item, not a launch blocker (no XSS sinks found in web/src).

LOW (fix opportunistically): login timing oracle (dummy bcrypt compare on unknown user), LIKE-wildcard escaping in the three search repositories, refresh-token reuse detection, `pnpm audit --prod` before ship.

Deploy-time env (already enforced in code, values needed at deploy): real `TRUST_PROXY_HOPS` hop count, random ≥32-char `JWT_SECRET`.

### Task 0.4: Code-review blockers (2026-08-08 review — verdict REQUEST CHANGES, architecture deploy-grade)

Hard requirements before the first real tenant:
- [ ] **Password reset**: no reset path exists anywhere — password is settable exactly once at employee create (`employees.repository.ts:108`). Add `password?` to `UpdateEmployeeDto` (ADMIN-set), hash in repository, null the user's `refreshTokenHash` on change.
- [ ] **Last-admin lockout guard**: `employees.repository.ts:127-169` lets an ADMIN deactivate/demote themselves or the last ADMIN/CEO — combined with no password reset, the tenant is unrecoverable. Reject when target is the caller or the last active ADMIN/CEO.
- [ ] **Contract status query 500**: `maintenance.controller.ts:45` passes raw `?status=` into a Postgres enum → 500. Validate against `MAINTENANCE_CONTRACT_STATUSES` like breakdowns already do (`:105-108`).
- [ ] **Visit dates stamped in UTC**: `recurrence.ts:70` `toIsoDate` uses UTC; a visit logged 00:00–03:00 EAT records yesterday. Hoist the dashboard's `BUSINESS_TIMEZONE = 'Africa/Addis_Ababa'` today-logic (`dashboard.repository.ts:100-116`) into `/common` and use it in `logVisit`.
- [ ] **Customers edit/delete UI**: `PATCH/DELETE /customers/:id` exist but have no UI. Add edit drawer + delete to `web/src/app/customers/page.tsx`.
- [ ] **Decide single-session auth**: one `refreshTokenHash` per user — second device silently logs out the first (`auth.service.ts:149-153`). Either document as intended or move to a refresh-token table. Decision, then ≤1d.

First weeks post-launch (not blockers):
- [ ] Projects PATCH endpoint (name/address typos currently permanent) 
- [ ] Health endpoint DB ping variant (`select 1`) — API currently reports healthy while Postgres is down
- [ ] Request logging (method/path/status/tenant) — only 5xx logged today
- [ ] `Pool` timeouts (`connectionTimeoutMillis`, `idleTimeoutMillis`) so a hung Postgres fails fast
- [ ] Dashboard float math on ETB (`dashboard.repository.ts:97-98,199-201`) — sum in SQL instead
- [ ] Searchable async selects (reference dropdowns truncate at 100 records)
- [ ] Tests for the six uncovered modules, priority: employees, maintenance repository, dashboard
- [ ] Auto-generated notifications (breakdown assignment, maintenance due) — largely lands with Phase 5.3 reminder rules; wire the in-app inbox from the same events

---

## Phase 1 — Effective-dated rate tables + fiscal calendar (detailed, executable)

The unwindable prerequisite: every finance row stores which rate version priced it.

**Files:**
- Create: `src/database/schema/rate-tables.ts`
- Create: `src/database/migrations/00XX_rate_tables.sql` (via `pnpm run db:generate`)
- Create: `src/modules/rates/rates.module.ts`, `rates.service.ts`, `rates.repository.ts`, `rates.controller.ts`
- Create: `src/modules/rates/dto/create-rate-version.dto.ts`, `dto/query-rate.dto.ts`
- Create: `src/modules/rates/rates.service.spec.ts`
- Create: `src/modules/rates/seed-rates.ts` (called from `db:seed`)
- Modify: `src/database/schema/index.ts`, `src/app.module.ts`, `src/database/seed.ts`

**Interfaces (later phases rely on these exactly):**
- Produces: `RatesService.resolve(kind: RateKind, onDate: string): Promise<RateVersion>` where
  `type RateKind = 'VAT' | 'WHT_GOODS' | 'WHT_SERVICES' | 'WHT_NO_TIN' | 'PAYE_BANDS' | 'PENSION_EMPLOYEE' | 'PENSION_EMPLOYER'`
  and `interface RateVersion { id: string; kind: RateKind; validFrom: string; validTo: string | null; payload: Record<string, unknown> }`
- Produces: `tenants.fiscalYearStart` (month-day string, default `'07-08'`) and
  `RatesService.fiscalYearFor(date: string, tenantFiscalStart: string): { start: string; end: string; label: string }`
- Rate rows are **global** (not tenant-scoped): statutory rates are national. Table has plain `id` PK, no `tenant_id`, read-only to tenants, writable only by ADMIN role.

### Task 1.1: Schema + migration

- [ ] **Step 1: Write the failing test** (`rates.service.spec.ts`)

```ts
import { Test } from '@nestjs/testing';
import { RatesService } from './rates.service';
import { RatesRepository } from './rates.repository';

describe('RatesService', () => {
  let service: RatesService;
  const repo = {
    findActive: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [RatesService, { provide: RatesRepository, useValue: repo }],
    }).compile();
    service = module.get(RatesService);
    jest.resetAllMocks();
  });

  it('resolves the version whose window contains the date', async () => {
    repo.findActive.mockResolvedValue({
      id: 'v2', kind: 'VAT', validFrom: '2024-08-21', validTo: null,
      payload: { percent: '15' },
    });
    const version = await service.resolve('VAT', '2026-08-08');
    expect(version.id).toBe('v2');
    expect(repo.findActive).toHaveBeenCalledWith('VAT', '2026-08-08');
  });

  it('throws RateNotFoundError when no version covers the date', async () => {
    repo.findActive.mockResolvedValue(undefined);
    await expect(service.resolve('VAT', '1990-01-01')).rejects.toThrow(
      'No VAT rate version covers 1990-01-01',
    );
  });

  it('computes the Ethiopian fiscal year for a date after 8 July', () => {
    expect(service.fiscalYearFor('2026-08-08', '07-08')).toEqual({
      start: '2026-07-08', end: '2027-07-07', label: 'FY2026/27',
    });
  });

  it('computes the fiscal year for a date before 8 July', () => {
    expect(service.fiscalYearFor('2026-05-01', '07-08')).toEqual({
      start: '2025-07-08', end: '2026-07-07', label: 'FY2025/26',
    });
  });
});
```

- [ ] **Step 2:** `pnpm test src/modules/rates/rates.service.spec.ts` → FAIL (module not found)
- [ ] **Step 3:** Write `src/database/schema/rate-tables.ts`:

```ts
import { date, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const rateKinds = [
  'VAT',
  'WHT_GOODS',
  'WHT_SERVICES',
  'WHT_NO_TIN',
  'PAYE_BANDS',
  'PENSION_EMPLOYEE',
  'PENSION_EMPLOYER',
] as const;
export type RateKind = (typeof rateKinds)[number];

export const rateVersions = pgTable('rate_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: rateKinds }).notNull(),
  validFrom: date('valid_from').notNull(),
  validTo: date('valid_to'), // null = open-ended current version
  payload: jsonb('payload').notNull(),
  source: text('source').notNull(), // e.g. 'VAT Proclamation 1341/2024'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4:** Export from `schema/index.ts`; `pnpm run db:generate`; inspect the generated SQL; add a partial unique index in the migration: `CREATE UNIQUE INDEX rate_versions_one_open_per_kind ON rate_versions (kind) WHERE valid_to IS NULL;`
- [ ] **Step 5:** Implement `RatesRepository.findActive(kind, onDate)` (Drizzle: `validFrom <= onDate AND (validTo IS NULL OR validTo >= onDate)`, order by `validFrom desc`, limit 1), `RatesService.resolve` (throws `RateNotFoundError extends Error` with the message asserted above), and `fiscalYearFor` (pure date arithmetic on month-day boundary; no external library).
- [ ] **Step 6:** `pnpm test src/modules/rates/rates.service.spec.ts` → PASS
- [ ] **Step 7:** Commit: `feat(rates): effective-dated statutory rate versions`

### Task 1.2: Seed current Ethiopian rates

- [ ] **Step 1:** Add to `seed-rates.ts` (idempotent — skip kinds that already have an open version):
  - VAT `{ percent: '15' }`, validFrom `2024-08-21`, source `VAT Proclamation 1341/2024`
  - WHT_GOODS `{ percent: '3', thresholdEtb: '20000' }`, WHT_SERVICES `{ percent: '3', thresholdEtb: '10000' }`, WHT_NO_TIN `{ percent: '30' }`, source `2025 Income Tax (Amendment)` — **flag `UNVERIFIED-current` in `source` until the tax practitioner confirms (decisions doc §8.5)**
  - PAYE_BANDS `{ bands: [...] }` — six bands, `UNVERIFIED-current` likewise
  - PENSION_EMPLOYEE `{ percent: '7', base: 'BASIC' }`, PENSION_EMPLOYER `{ percent: '11', base: 'BASIC' }`
- [ ] **Step 2:** Wire into `src/database/seed.ts`; run `pnpm run db:seed` twice; verify second run inserts nothing
- [ ] **Step 3:** Commit: `feat(rates): seed current Ethiopian statutory rates`

### Task 1.3: Rates admin endpoints + tenant fiscal year

- [ ] **Step 1:** `GET /rates?kind=VAT&on=2026-08-08` (any authenticated user) and `POST /rates` (ADMIN only: closes the open version by setting its `validTo`, inserts the new one — single transaction). DTO validates `kind` against `rateKinds`, dates ISO, payload object.
- [ ] **Step 2:** Add `fiscalYearStart` text column (default `'07-08'`) to `tenants` schema + migration; expose in existing settings module GET/PATCH.
- [ ] **Step 3:** Controller spec asserting the ADMIN role gate on POST (mirror the existing RolesGuard spec pattern from `e8312ad`).
- [ ] **Step 4:** `pnpm test` → all green. Commit: `feat(rates): rate admin API and tenant fiscal year`

---

## Phase 2 — Export engine

Client demand: "every possible exporting" — CSV + Excel on every list, PDF + Word on every document. One shared exporter in `/common`, zero per-module export services.

**New dependencies:** `exceljs` (MIT), `docx` (MIT), `puppeteer` (Apache-2.0, restored). **Never `xlsx`/SheetJS** (license trap). Font: vendor `NotoSansEthiopic-Regular.ttf` + `-Bold.ttf` into `src/common/export/fonts/` (OFL — include the license file).

**Interfaces:**
- Produces: `writeCsv(res: Response, filename: string, columns: ColumnDef[], rows: AsyncIterable<Record<string, unknown>>): Promise<void>` and `writeXlsx(...same signature)` in `src/common/export/tabular.ts`, where `interface ColumnDef { key: string; header: string; format?: 'text' | 'money' | 'date' }`
- Produces: `renderDocumentPdf(templateName: DocumentTemplate, data: object, branding: TenantBranding): Promise<Buffer>` in `src/common/export/document-pdf.service.ts` (Puppeteer singleton browser, restored from `441f07f`)
- Produces: `renderDocumentDocx(templateName: DocumentTemplate, data: object, branding: TenantBranding): Promise<Buffer>` (docx library)
- Produces: `type DocumentTemplate = 'quotation' | 'proforma' | 'invoice' | 'receipt' | 'contract' | 'maintenance-report' | 'installation-certificate' | 'warranty-certificate'`
- Produces: `TenantBranding { name: string; slogan: string; logoUrl: string | null; address: string; phones: string[]; primaryColor: string }` sourced from tenant settings.

### Tasks (each gets TDD micro-steps in the Phase 2 detailed plan)

- [ ] **2.1 Tabular exporter** (`/common/export/tabular.ts`): CSV via manual RFC 4180 escaping streamed row-by-row (no library needed); XLSX via ExcelJS streaming workbook writer. Unit tests: quoting/commas/newlines/Ethiopic text; money cells as text with 2 decimals (never float).
- [ ] **2.2 `?format=` on every list endpoint**: `customers, projects, employees, assets, maintenance contracts, breakdowns` GET-list controllers accept `format=csv|xlsx`; when present, ignore pagination and stream the full filtered set (repository gains a `streamAll(filters)` returning an async iterator batching 500 rows). One shared `ExportQueryDto` in `/common`.
- [ ] **2.3 Restore the Puppeteer PDF pipeline**: `git show 441f07f` — restore `document-pdf` service + HTML template layout (letterhead header with logo/slogan/address footer matching the client's stationery), as a `/common/export` service this time (it must serve quotations, invoices, receipts, reports alike). `@font-face` Noto Sans Ethiopic from the vendored files; template smoke test asserts an Amharic string survives to the rendered PDF (pdf text extraction contains 'ኤሌቬተር' or the chosen probe word).
- [ ] **2.4 Word documents**: same template data → `docx` sections. Word output is for documents the client edits before sending (contracts above all). Word for: quotation, proforma, contract. Skip Word for receipts/reports until asked.
- [ ] **2.5 Excel document exports**: quotation/proforma as structured XLSX (the client PDF explicitly lists Excel export for these) using the 2.1 writer.
- [ ] **2.6 Amharic-safe search**: normalize Ethiopic homophones (ሀ/ሐ/ኀ, ሰ/ሠ, ጸ/ፀ, አ/ዐ) on write (generated normalized column on `customers.name`, `buildings`/project names) and on search input, so a name typed one way and searched the other still matches. Port the mapping table (~40 codepoint pairs) into `/common/text/ethiopic-normalize.ts` with unit tests; add the normalized columns via migration backfill.

---

## Phase 3 — Quotations + Proforma resurrection

The chain the finance module bills against. **Restore from git, adapt — do not rewrite.** Source commits: `3f6fc72` (generate from calc), `5657cc2` (lifecycle), `b00ccf4` (DAG gate), `441f07f` (PDF), `2c178d5` (admin UI); removed in `f0fea5c` (schema `0021_drop_quotations.sql` shows what to re-add).

- [ ] **3.1 Restore schema** as new migration (composite PK, RLS policy — copy the pattern from `customers.ts`): `quotations` + `quotation_lines`, statuses `DRAFT → PENDING_APPROVAL → APPROVED → CONVERTED_TO_PROFORMA / REJECTED / EXPIRED`. Add what the old schema lacked: `approvedByUserId` (the client PDF requires Sales-Manager approval), `rateVersionId` FK for VAT.
- [ ] **3.2 Restore service + lifecycle + calc integration**; VAT line comes from `RatesService.resolve('VAT', quotationDate)` — delete any hardcoded 15.
- [ ] **3.3 Proforma invoices**: new thin table (`proforma_invoices`) generated from an APPROVED quotation, numbered `PF-{fiscalYearLabel}-{seq}` per tenant per fiscal year (sequence table, gapless within year).
- [ ] **3.4 Documents**: quotation/proforma PDF + Word + Excel through the Phase 2 pipeline. Amharic customer names must render.
- [ ] **3.5 Project DAG gate restored**: `QUOTATION → PROFORMA` transition requires an approved quotation/issued proforma (restore `b00ccf4` behavior against the current `project-status.ts`).
- [ ] **3.6 Admin UI**: restore quotations pages (list + drawer per admin-ui rules), add proforma tab.

**Deliberately not restored:** duplicate-customer detection and the permissions tables (removed with cause in `f0fea5c`; the client PDF's "Duplicate Project Prevention" stays out unless the client re-asks — flag it to them).

---

## Phase 4 — Finance core (AR, payments, expenses, banks)

The internal book. Everything append-only; corrections are reversing entries.

**Schema (all tenant-scoped, composite PK, RLS, ETB `numeric(14,2)`):**
- `invoices`: from proforma or standalone (maintenance billing); status `ISSUED → PARTIALLY_PAID → PAID / VOID`; `rateVersionId`; totals stored (subtotal, vatAmount, whtAmount, total); **five nullable fiscal columns**: `fiscalReceiptNumber`, `fiscalDeviceSerial`, `fiscalIssuedAt`, `fiscalKind`, `fiscalNote` — filled manually when the client issues the legal document from their ETR/certified device; the ERP invoice is the internal mirror.
- `invoice_lines`
- `payments`: method enum `CASH | BANK_TRANSFER | CHEQUE | CBE_BIRR | TELEBIRR | OTHER`, `bankAccountId` nullable, receipt number sequence per tenant.
- `payment_allocations`: payment → invoice many-to-many; over-allocation impossible (CHECK + service guard).
- `expenses`: category enum from client's chart (fold in pasted client info when it arrives), supplier TIN + licence-on-file flag → WHT 3% vs 30% from rate table, approval status.
- `bank_accounts` + `bank_transactions`: manual entry + statement import (CSV — reuse 2.1 reader? no: import is parse, add tiny csv-parse of the bank's format when we have a sample; until then manual entry only).

**Tasks:** 4.1 schema+migrations, 4.2 invoices (issue from proforma; number `INV-{fy}-{seq}`), 4.3 payments + allocations + aging (buckets 0-30/31-60/61-90/90+), 4.4 customer statement + `outstandingBalanceEtb` ownership (recomputed from allocations — the column finally gets an owner; nightly reconciliation job asserts stored == derived), 4.5 expenses + WHT flag, 4.6 banks, 4.7 receipt/invoice PDFs, 4.8 payment-reminder rules feeding Phase 5 outbox (monthly maintenance payment, contract installment, advance due, warranty expiry, service due — the client PDF's exact list), 4.9 admin UI (finance section: invoices, payments, expenses, banks, aging report page).

---

## Phase 5 — SMS channel + reminders

**Use case (client):** technician gets an SMS with the next maintenance date for an elevator; customers get payment/service reminders.

### Provider evaluation (decision input — confirm price + internet answer with client)

| Option | Works without internet | Sender ID (brand name) | Cost model | Amharic | Verdict |
|---|---|---|---|---|---|
| **GeezSMS** (local aggregator) | No | Yes (registration) | ETB per SMS, prepaid | Yes (70 chars/segment) | **Default choice** — local, ETB, simple REST API |
| **AfroMessage** (local aggregator) | No | Yes (registration) | ETB per SMS, prepaid | Yes | Equal alternative; pick on price/support response |
| Ethio Telecom A2P direct | No | Yes | Contract, procurement-heavy | Yes | Only at volume; slowest paperwork |
| **Gammu + USB GSM modem + SIM** | **Yes** | No (shows a phone number) | Standard SIM rates | Yes | **Fallback if the office truly has no internet**; ~6–10 SMS/min throughput is ample for reminders |
| Twilio/Vonage | No | Foreign routes unreliable to ET | USD | Partial | Rejected: cost, FX, delivery reliability into Ethiopia |

The **outbox table makes this choice reversible** — the adapter is one class either way. **DECIDED 2026-08-08: the client's office has internet (user confirmed), so the aggregator path is primary** — register with GeezSMS *and* AfroMessage this week (both cheap/free to start), measure delivery to the client's own phones, pick one; the Gammu adapter stays as no-internet insurance only if outages prove it necessary. **Start sender-ID registration now, not at Phase 5 kickoff — it is a user/client action, not code.**

### Tasks

- [ ] **5.1 Outbox**: `outbound_messages` table (tenant-scoped): `channel 'SMS' | 'EMAIL'`, `recipient`, `body`, `status QUEUED → SENDING → SENT / FAILED`, `attempts`, `nextAttemptAt`, `dedupeKey` unique per tenant (idempotency: enqueueing the same reminder twice is a no-op), `providerMessageId`. This is the generic outbox the decisions doc wants for outage tolerance — SMS is its first consumer.
- [ ] **5.2 Dispatcher**: `@nestjs/schedule` cron every minute; claims QUEUED rows `FOR UPDATE SKIP LOCKED`, batch ≤ 20; exponential backoff (1m/5m/30m/6h, then FAILED); provider adapter interface `SmsProvider { send(to: string, body: string): Promise<{ providerMessageId: string }> }` with `GeezSmsProvider` (HTTP) and `GammuFileProvider` (writes gammu-smsd outbox spool files) selected by env var.
- [ ] **5.3 Reminder rules**: daily cron per tenant — maintenance contracts where `nextServiceAt` within N days (tenant setting, default 3): SMS to assigned technician (`users.phone`) + customer (`customers.phone`), Amharic-capable template with GSM-vs-UCS2 segment counting test; breakdown-assignment SMS to technician on ticket assign; Phase 4 payment reminders enqueue here.
- [ ] **5.4 Message log UI**: outbound messages list page (status, retries) — the client must be able to see "did the SMS go out".
- [ ] **5.5 Email adapter** (same outbox, nodemailer + office SMTP) — cheap once the outbox exists; the client PDF lists Email as a notification method. Defer if SMTP account doesn't exist.

---

## Phase 6 — GL + financial reports

The client PDF's report list: Income Statement, Expense Report, Cash Flow, P&L, Outstanding Payments, Revenue Report.

- **Outstanding Payments + Revenue + Expense reports**: derivable from Phase 4 tables directly — build first, ship early (~3d each with export via Phase 2).
- **Income Statement / P&L / Cash Flow properly**: require the GL. `journal_entries` + `journal_lines` (double-entry, append-only, balanced-per-entry CHECK via trigger), auto-posting from Phase 4 events (invoice issued → AR/revenue/VAT-payable; payment → cash/AR; expense → expense/cash+WHT-payable), own compact COA template (~40 accounts rolling up to IFRS-for-SMEs statement lines), period close per fiscal month, trial balance. Audit log lives here.
- Detailed plan written at Phase 6 kickoff; do not start before Phase 4 is in production use — real usage will correct the COA.

---

## Phase 7 — Deployment + outage hardening

- [ ] **7.1** Docker Compose production bundle (API + web + Postgres + backup sidecar) with an install runbook for the client's LAN server; UPS assumed for the ~39 outages/month; `synchronous_commit=on` for the finance database (it already is Postgres default — verify it was not tuned off).
- [ ] **7.2** Idempotency keys on all mutating finance endpoints (`Idempotency-Key` header → unique index on `(tenant_id, key)` in a `idempotency_keys` table, replay returns first response).
- [ ] **7.3** Nightly `pg_dump` to a second disk + weekly restore drill documented; backups stay on-premises (Art 22 — no offshore replica until ECA answers, decisions doc §8.6).
- [ ] **7.4** Ops basics: health endpoint verified, log rotation, `docker compose` restart policies, admin password rotation procedure for handover.

---

## Self-review notes

- The client PDF's "Internal Communication System (LAN messaging, chat, file sharing)" and marketing/campaign module are **not in this plan** — chat is a product in itself; recommend the client uses Telegram/WhatsApp groups. Flag to client, decide separately.
- "Duplicate Project Prevention" deliberately excluded (removed in `f0fea5c` with cause) — tell the client rather than silently rebuild.
- Payroll (PAYE/pension) is seeded in Phase 1 rates but the payroll module itself is **out of this plan** — it was in the decisions-doc build order (item 6) and can slot after Phase 6; the client PDF does not list payroll as a module.
- Type/interface names cross-checked: `RatesService.resolve`/`RateVersion` (P1) used in P3.2, P4 invoices; `writeCsv/writeXlsx/ColumnDef` (P2.1) used in P2.2, P6 report exports; `renderDocumentPdf`/`DocumentTemplate` (P2.3) used in P3.4, P4.7; outbox `dedupeKey` (P5.1) used by P4.8, P5.3.
