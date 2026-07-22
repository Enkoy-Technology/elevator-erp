# Implementation Plan: Phase 2 — Quotations → Proforma → Contract

## Task
Quotations that consume Phase 1 calc pricing, convert through the sales
document lifecycle (quote → proforma → contract), gate the project status
DAG on quote approval, and emit branded PDFs. Currency: **ETB**, decimal math.

## Context
- Phase 1 `ElevatorCalcService` is live and **already `exports`** from its
  module → quotations reuse it via DI (no float, no duplicated money logic).
- `ProjectsService` is exported too → reuse `getById` for project validation.
- TAD §3.4 Module 3 endpoints:
  `POST /projects/:id/quotations`, `POST /quotations/:id/approve`,
  `/convert-proforma`, `/convert-contract`, `/generate-pdf`, `/send`.
- Multi-tenancy: composite PK `(tenant_id, id)`, RLS + `TenantDbService`,
  hand-written RLS migration mirroring `0005_projects_rls.sql`.

## Data model decision — one table, status DAG
The TAD conversion endpoints all hang off `/quotations/:id`, and proforma /
contract carry the **same amounts** as the approved quote. So a single
`quotations` table whose `status` walks a DAG, not three near-identical
tables. Calc output is snapshotted (jsonb) so later price-list changes never
mutate an issued quote; queryable money is also lifted into numeric columns.

`quote_status`: `DRAFT → APPROVED | REJECTED | CANCELLED`,
`APPROVED → PROFORMA | CANCELLED`, `PROFORMA → CONTRACT | CANCELLED`;
`REJECTED / CONTRACT / CANCELLED` terminal. Service-layer guard
(`canTransitionQuoteStatus`) — same shape as `project-status.ts`.

## Decisions worth surfacing
- **Reuse over boundary purity:** quotations import `ElevatorCalcModule` +
  `ProjectsModule` (their services are explicitly exported) and extend
  `CalculateSpecsDto`. The "no cross-module import" rule targets reaching into
  internals; duplicating money-input validation + pricing math is the worse
  sin. Logged here rather than re-litigated per file.
- **Quote number:** `QTN-<year>-<8 hex of id>` — unique, no cross-txn
  sequence/race. `ponytail:` non-sequential; swap to a per-tenant sequence
  if finance needs gap-free numbering.
- **Server recomputes pricing** from the posted `CalcInput` — client-sent
  money is never trusted.

## Requirements (sliced commits)
1. **[this slice]** `quotations` schema + enum + migration + RLS; create quote
   from calc (`POST /projects/:id/quotations`), `GET /quotations`,
   `GET /quotations/:id`. Status DAG helper + unit test. Snapshot + money cols.
2. Lifecycle transitions: `approve` (Sales Manager+), `convert-proforma`,
   `convert-contract`, `cancel`/`reject`. Guarded by `canTransitionQuoteStatus`.
3. Wire project DAG: `projects` QUOTATION → PROFORMA blocked unless an
   APPROVED quote exists (blocking condition in `ProjectsService.updateStatus`).
   On CONTRACT, copy quote total into `projects.contract_amount_etb`.
4. Branded PDF: `POST /quotations/:id/generate-pdf` — tenant logo/colors,
   pricing table. (Email/BullMQ `send` can follow.)
5. Admin UI `/quotations`: paginated list + right-drawer create-from-calc,
   approve/convert actions, PDF download. Drawers + `{ items,…,totalPages }`.

## Exit gate (full Phase 2)
Create customer → project → quote from calc → approve → convert toward
contract → branded PDF; duplicate lead already flagged.

## Risks
- Quote status DAG must reject illegal transitions at the **service** layer.
- Project↔quote coupling: PROFORMA gate reads quote state — keep it a single
  guarded query, no N+1.
- PDF gen is the heaviest slice; keep it synchronous first, queue later.
