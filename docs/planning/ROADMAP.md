# Elevator ERP — Phased Delivery Roadmap

Derived from the TAD's 9 modules, ordered by **dependency** (each phase builds on
the prior). The TAD ships no roadmap of its own. Every phase has an exit gate —
do not start the next phase until the gate passes.

Rule for each phase: write a plan in `docs/planning/FEATURE-*.md` (use `TEMPLATE.md`)
→ implement → tests green → `security-auditor` + `code-reviewer` pass → merge.

---

## Phase 0 — Foundation & Multi-Tenancy  *(blocks everything)*

**Goal:** a running NestJS app where tenant isolation is provably enforced.

- Scaffold NestJS 11 + TypeScript, `package.json` scripts (reconcile `AGENTS.md`).
- Drizzle 0.40 + PostgreSQL 16; `set_tenant_context()`, RLS policy pattern, `admin_bypass`.
- Convention enforced: `tenant_id` first column, UUID PKs, **composite FKs `(tenant_id, id)`**, soft-delete `deleted_at`.
- Auth: JWT (15-min access / 7-day refresh), `tenant_id`+role+permissions claims, `TenantGuard`, optional TOTP MFA.
- Global exception filter (RFC 7807), structured logging, rate limit (1000 req/min/tenant).
- CI green (typecheck, lint, test, build, `pnpm audit`).

**Exit gate:** an integration test proves tenant A cannot read tenant B's rows, at both the app layer and with RLS as the sole guard.

---

## Phase 1 — Elevator Technical & Pricing Calculator  *(Module 2)*

**Goal:** stateless, correct spec + price engine. Highest value, purely testable.

- Implement all of `docs/elevator-calc-formulas.md` with `decimal.js` (never float).
- `CalcInputDto` with class-validator constraints from §4.1.1.
- `ElevatorCalcService.calculateSpecs()` single entry point; private sub-calcs.
- Editable pricing coefficients per tenant; spec persistence + templates.
- Resolve the two flagged doc inconsistencies (shaft_depth, SLA) first.

**Exit gate:** unit test asserts the §4.2.3 worked example → `TOTAL_PRICE = 9,883,125.00`, plus boundary cases (min/max Q, v>2.5, MRL, HOSPITAL, INDUSTRIAL). *(Superseded Aug 2026: the TAD multiplier model was retired for the product price list — see `docs/elevator-calc-formulas.md` §4.2.)*

---

## Phase 2 — Sales, Quotations & Duplicate Detection  *(Module 3)*

**Goal:** lead → contract lifecycle with branded documents.

- CRM lead/customer model; project status DAG (LEAD…COMPLETED) with blocking transitions → `WorkflowTransitionError`.
- Duplicate detection composite score (pg_trgm, Soundex, geohash+Haversine); >0.75 review, >0.90 block.
- Quotation → proforma → contract conversion, consuming Phase 1 pricing.
- Branded PDF generation (`generate-pdf` skill) + email dispatch (BullMQ).

**Exit gate:** create a quote from a calc, convert to contract, generate a branded PDF; duplicate lead is flagged before insert.

---

## Phase 3 — Field Installation & Crew Management  *(Module 4)*

**Goal:** execute an installation from contract to handover.

- Project phase enum (SHAFT_PREPARATION…COMPLETED), digital checklists, photo docs (S3), customer sign-off.
- Crew model/assignment; mobile field-engineer endpoints + GPS.

**Exit gate:** a contract advances through all 5 install phases to HANDOVER with checklist + signed handover persisted.

---

## Phase 4 — Maintenance Engine + Inventory  *(Modules 5 & 7, paired)*

**Goal:** scheduled service that consumes parts. Paired because ticket completion auto-deducts stock.

- Maintenance recurrence scheduler (all 8 interval types) → auto ticket generation; dispatch + route optimization.
- Multi-warehouse inventory; immutable transaction ledger (RECEIPT/ISSUE/RETURN/ADJUSTMENT/TRANSFER — never delete, reverse); `quantity_available = on_hand − reserved`.
- Auto-deduct parts on ticket completion; reorder alerts / PO generation.

**Exit gate:** a monthly schedule generates a ticket; resolving it deducts stock via ledger entries; low stock raises a reorder alert.

---

## Phase 5 — Breakdown & Emergency Dispatch  *(Module 6)*

**Goal:** public reporting with real-time SLA enforcement.

- Public QR-code breakdown reporting (no auth, rate-limited, input-validated).
- SLA monitor worker (severity matrix), auto-dispatch to nearest on-call tech, escalation.
- Reuses Phase 3 crew + Phase 4 dispatch.

**Exit gate:** anonymous QR report creates a ticket, auto-assigns nearest tech, and the SLA timer + escalation fire on breach.

---

## Phase 6 — Finance, Invoicing & Reminders  *(Module 8)*

**Goal:** get paid. Depends on contracts (P2), maintenance (P4), breakdowns (P5).

- Batch invoice generation (STANDARD/MAINTENANCE/INSTALLMENT/CREDIT_NOTE); Stripe payments.
- Multi-channel reminders (email/SMS), aging reports, MRR/churn, credit notes, write-offs.

**Exit gate:** generate invoices for active contracts, take a Stripe payment, and fire an overdue reminder on schedule.

---

## Phase 7 — Executive Dashboard & Analytics  *(Module 9)*

**Goal:** real-time visibility. Last, because it aggregates everything above.

- KPI computations (Redis-cached, 15-min pre-compute + daily rollup).
- Pipeline funnel, sales/crew performance, SLA compliance; custom reports/exports.
- Socket.io WS gateway for live updates.

**Exit gate:** dashboard renders live KPIs from real data across modules, updating over WebSocket.

---

## Cross-cutting (every phase, not a phase)

Multi-tenancy + RLS on all new tables · `security-auditor` on any auth/input/DB
change · immutable ledgers never destructively migrated · decimal math for money ·
external APIs (Stripe/Twilio/SES/Maps) mocked in unit tests.
