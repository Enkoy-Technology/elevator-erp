# Implementation Plan: Phase 2 — Customer Duplicate Detection

## Task
Fuzzy duplicate check before customer create (TAD §3.4), so sales cannot
silently insert near-identical accounts.

## Context
- Customers CRUD + CRM UI already shipped (ETB, drawers, pagination).
- Phase 2 plan follow-up #1 after customers / projects / UI.
- TAD: four signals → composite 0–1; `>0.75` review, `>0.90` block.
- Endpoint: `POST /customers/check-duplicate`; create path must honor scores.

## Requirements
- [ ] Enable `pg_trgm` + `fuzzystrmatch` (Soundex) via migration.
- [ ] `customer_fingerprints` table (tenant-scoped, RLS) synced on create/update.
- [ ] Composite scorer: name 35%, phone 25%, geo 25%, building 15%.
- [ ] `POST /v1/customers/check-duplicate` returns matches + recommendation.
- [ ] `POST /v1/customers` blocks `HIGH_CONFIDENCE_DUPLICATE` (≥0.90); allows
      `REVIEW_BEFORE_CREATE` (≥0.75) only with `acknowledgePossibleDuplicate`.
- [ ] Admin create drawer calls check-duplicate and surfaces review/block UI.
- [ ] Unit tests for scorer thresholds and create-gate behavior.

## Open Questions
- Missing signals: **renormalize weights** over signals present on both sides
  (avoids false lows when geo/building omitted).
- Ethiopia phones: normalize to E.164 (`+251…`); non-ET left as digits-only.

## Proposed Approach
1. Migration: extensions + `customer_fingerprints` + RLS/grants.
2. `DuplicateDetectionService` + fingerprint sync in `CustomersRepository`.
3. Wire check endpoint + create gate; Swagger tag unchanged (`customers`).
4. Web: before save, call check; show matches; require acknowledge for review.

## Files to Modify
- `src/database/migrations/` — extensions, fingerprints, RLS
- `src/database/schema/customer-fingerprints.ts`
- `src/modules/customers/` — check DTO, service, controller, create gate
- `web/src/app/customers/page.tsx` + `web/src/lib/api.ts`
- `*.spec.ts` — scorer + gate

## Verification
- [ ] Unit tests pass; typecheck pass
- [ ] Manual: create customer A; check-duplicate near-clone → REVIEW/BLOCK
- [ ] Create with acknowledge succeeds for REVIEW band only

## Risks
- Extension install needs admin DB role (`DATABASE_ADMIN_URL`) — already used for migrate.
- Trigram index rebuild cron deferred (TAD weekly job); sync-on-write is enough for v1.
