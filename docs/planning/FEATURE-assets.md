# FEATURE: Asset registration

## Goal
Register equipment and follow it: a lift arriving from the factory, checked in
against its packing list, sold and installed; or a lift already installed that
the company looks after.

Design: `docs/superpowers/specs/2026-11-06-lift-arrival-tracking-design.md`.

## In scope
- List assets (paginated; filter by category / customer; search by name or serial)
- Filter by status and by sold / in stock; list shows parts short
- Register from the factory (On order, in stock, with the packing list) or
  already installed (In service, customer required, no checklist)
- Update basic fields; status and sold-to change only through their own actions
- Parts per lift: every part starts as arrived, and people tap what did not
  come, one part or a whole case, when registering or updating a lift
- Status steps with who may press each, General Manager correction, history.
  The next forward step is a button in the Assets table, and Assign customer
  sits beside "In stock" for Sales Manager and General Manager
- Soft delete

## Out of scope (later)
- Maintenance contracts / visit schedules (Maintenance slice)
- Spec sheets / photos / QR codes
- Inventory stock linkage. The checklist is one list per lift, not stock
- Importing the factory's Excel file for each lift's true list and quantities

## Categories
`ELEVATOR` | `STAIRS` | `OTHER`

## API
- `GET /v1/assets`
- `GET /v1/assets/:id`
- `POST /v1/assets`
- `PATCH /v1/assets/:id`
- `DELETE /v1/assets/:id` (soft)
- `GET /v1/assets/:id/tracking`: lift, checklist, history, next steps
- `POST /v1/assets/:id/status`: next step
- `POST /v1/assets/:id/status/correct`: General Manager, reason required
- `PUT /v1/assets/:id/sold-to`: Sales Manager, General Manager
- `PATCH /v1/assets/:id/checklist/:itemId`: mark, quantity, note
- `POST /v1/assets/:id/checklist/cases/:caseNo/mark`: tick or untick a case
- `GET /v1/assets/packing-list`: the parts a new lift starts with

Roles: see `docs/planning/ROLE-ACCESS-MATRIX.md` (CEO/ADMIN always allowed).

## UI
`/assets` list, `/assets/new`, `/assets/[id]/edit`, and
`/assets/[id]/checklist` for parts, status, sold-to and history. Parts also
show on the register and edit forms.

## Exit criteria
- [x] Can register an elevator under a customer
- [x] Category filter works
- [x] Soft-deleted assets disappear from list
- [x] A lift from the factory can be registered with no customer
- [x] The store keeper can check a lift in and finish with parts short
