# Implementation Plan: Phase 3 — Field Installation & Crews

## Task
Execute a contracted elevator project through five installation phases with
digital checklists, crew assignment, and customer sign-off — through to
HANDOVER / COMPLETED.

## Context
- Phase 2 exit gate met: quote → proforma → contract + branded PDF.
- TAD §3.5 Module 4; ROADMAP Phase 3.
- Project status already reaches `CONTRACT` / `EXECUTION` via quotations.
- Multi-tenancy: composite PK `(tenant_id, id)`, RLS + `TenantDbService`.
- Admin UI rules: right-side drawers, server-paginated lists (`AGENTS.md`).

## Requirements (sliced commits)
1. ~~Schema + RLS: `crews`, `crew_members`, `project_phases` (+ enums).~~
2. ~~Auto-create five phases when listing for CONTRACT/EXECUTION (idempotent).~~
3. ~~Crews API: list/create, add/remove members (`is_lead`).~~
4. ~~Phases API: list, assign, start, checklist, sign-off, complete (+ project
   COMPLETED on HANDOVER).~~
5. ~~Admin UI: `/crews` + `/installation`.~~
6. Deferred: multipart photo upload to S3, mobile `/field/*` + GPS, installed
   elevator registry + QR (can land as Phase 3 follow-ups or early Phase 5).

## Phase enum (sequential)
`SHAFT_PREPARATION` → `MECHANICAL_ASSEMBLY` → `ELECTRICAL_WIRING` →
`TESTING_COMMISSIONING` → `HANDOVER` → (row status `COMPLETED`).

Phase row `status`: `PENDING` | `IN_PROGRESS` | `COMPLETED`.

## Checklist item shape (JSONB)
`{ id, label, required, completed, completedAt?, completedBy?, photoUrl?, notes? }`

## Exit gate
A project in `EXECUTION` advances through all five phases to HANDOVER with
required checklist items completed and a sign-off persisted.

## Risks
- Only one `IN_PROGRESS` phase per project at a time (enforce in service).
- Completing HANDOVER should advance project status toward `COMPLETED`
  (coordinate with existing project DAG — `EXECUTION → COMPLETED`).
- Photo/sign-off without S3: store HTTPS URLs only; validate URL shape.
