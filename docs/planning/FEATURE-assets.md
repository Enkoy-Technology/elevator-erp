# FEATURE: Asset registration

## Goal
Register installed / managed equipment under a customer: elevators, stairs, or other.

## In scope
- List assets (paginated; filter by category / customer; search by name or serial)
- Create asset linked to a customer (optional project + building name)
- Update basic fields + soft status (ACTIVE / INACTIVE / DECOMMISSIONED)
- Soft delete

## Out of scope (later)
- Maintenance contracts / visit schedules (Maintenance slice)
- Spec sheets / photos / QR codes
- Inventory stock linkage

## Categories
`ELEVATOR` | `STAIRS` | `OTHER`

## API
- `GET /v1/assets`
- `GET /v1/assets/:id`
- `POST /v1/assets`
- `PATCH /v1/assets/:id`
- `DELETE /v1/assets/:id` (soft)

Roles: `SALES_MANAGER`, `TECHNICAL_LEAD` (CEO/ADMIN always allowed).

## UI
`/assets` — table + right-side drawer for add/edit.

## Exit criteria
- [x] Can register an elevator under a customer
- [x] Category filter works
- [x] Soft-deleted assets disappear from list
