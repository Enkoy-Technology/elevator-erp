# FEATURE: Maintenance & follow-up

## Goal
Track service contracts on registered assets, log visits, and handle light breakdown tickets.

## In scope
- Maintenance contract on an asset (recurrence + next service date)
- Log a service visit → bump `lastServiceAt` / `nextServiceAt`
- Breakdown tickets: `OPEN` → `ASSIGNED` → `DONE`
- Optional assignment notice via notifications (send from Notifications inbox)

## Out of scope
- GPS check-in, SLA timers, crew dispatch boards
- Parts / inventory consumption
- Customer portal

## Recurrence
`DAILY` | `WEEKLY` | `BIWEEKLY` | `MONTHLY` | `QUARTERLY` | `BIANNUAL` | `ANNUAL` | `CUSTOM`

## Severity
`EMERGENCY` | `CRITICAL` | `HIGH` | `MEDIUM` | `LOW`

## API
- `GET/POST /v1/maintenance/contracts`
- `PATCH /v1/maintenance/contracts/:id`
- `POST /v1/maintenance/contracts/:id/visits`
- `GET /v1/maintenance/contracts/:id/visits`
- `GET/POST /v1/maintenance/breakdowns`
- `PATCH /v1/maintenance/breakdowns/:id`

## UI
`/maintenance` — contracts table + breakdowns table; drawers for create/edit/log visit

## Exit criteria
- [x] Contract on an asset with next service date
- [x] Logging a visit advances the schedule
- [x] Breakdown can move Open → Assigned → Done
