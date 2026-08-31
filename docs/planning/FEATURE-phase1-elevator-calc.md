# Implementation Plan: Phase 1 — Elevator Technical & Pricing Calculator

## Task
Stateless spec + price engine matching `docs/elevator-calc-formulas.md`, exposed
as `POST /v1/elevator-specs/calculate`, with a calculator screen in the admin UI.

## Context
- Phase 0 auth + RLS and admin shell are live.
- Section 4 of the TAD / `elevator-calc-formulas.md` is authoritative.
- Doc resolution: use Section 4 `shaft_depth = car_depth + wall_clearance_d + 100`.
- Money and dimensions: `decimal.js` only — never JS `number` for intermediates.

## Requirements
- [ ] `ElevatorCalcService.calculateSpecs(input)` returns technical + pricing breakdown
- [ ] Unit test: §4.2.3 worked example → `TOTAL_PRICE = 9883125.00` *(was 156882.63 under the retired TAD multiplier model — see `docs/elevator-calc-formulas.md` §4.2)*
- [ ] Boundary cases: min/max Q, v>2.5, MRL, HOSPITAL, INDUSTRIAL
- [ ] `POST /elevator-specs/calculate` (authenticated, any role) — stateless
- [ ] Admin UI page at `/calculator` unlocked in sidebar

## Deferred (later Phase 1 follow-ups)
- Spec persistence, templates, duplicate, tenant pricing-factor overrides

## Verification
- [x] `pnpm test` asserts worked example (formula-correct totals; TAD typos noted)
- [x] Swagger + UI produce the same total for the fixture input (`157358.67`)

## Risks
- Floating-point drift if any path uses `number` — keep Decimal end-to-end and
  serialize money as 2-decimal strings in the API response.
- TAD §4.2.4 printed intermediates have arithmetic typos (BASE_COST product and
  INSTALLATION 6,885 vs formula 6,871.50). Engine follows the formulas; unit
  tests lock the Decimal-correct totals and document the discrepancies.
