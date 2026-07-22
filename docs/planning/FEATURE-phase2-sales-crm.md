# Implementation Plan: Phase 2 — Sales, CRM & Project Pipeline

## Task
Lead → customer → project lifecycle with status DAG, then quotations that
consume Phase 1 pricing. Currency throughout: **ETB**.

## Context
- Phase 1 calculator is live (stateless). Spec persistence still deferred.
- TAD §3.4 Module 3; project status DAG LEAD → … → COMPLETED / CANCELLED.
- Multi-tenancy: composite PK `(tenant_id, id)`, RLS + `TenantDbService`.

## Requirements (sliced commits)
1. ~~Customers schema + RLS + CRUD API (+ soft delete)~~
2. ~~Projects schema + status transition API (`WorkflowTransitionError`)~~
3. ~~Admin UI: customers list/create + projects pipeline~~
4. ~~Duplicate detection — see `FEATURE-phase2-duplicate-detection.md`~~
5. Follow-ups: quotation/proforma/contract, branded PDF

## Exit gate (full Phase 2)
Create customer → project → quote from calc → convert toward contract;
duplicate lead flagged. Early slices unlock CRM UI before quotes land.

## Risks
- Status DAG must reject illegal transitions at the service layer (not only UI).
- Composite FKs to customers/users for sales_rep assignments.
