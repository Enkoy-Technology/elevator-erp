# Lift arrival check and tracking

Status: approved by the user on 2026-11-06 and live since `60a25e6`.

**Changed by the user the same day:** the parts must be there by default and all
arrived, and people check or uncheck them while creating or updating the asset.
This replaces the marks in "The checklist" below. Every row starts ticked, an
untick is Missing, a whole case can be ticked or unticked, and the list shows on
the register and edit forms as well as the lift's page. All OK, Damaged and Not
in this lift are gone from the screens.

**Redesigned after the user found that screen confusing for store keepers:** a
case does one thing, open, and shows its number large, like the label on the
crate. A part does one thing, flip between Arrived and Missing, with the word on
the row. Quantity and note sit behind Details, so a tap never moves a row. The
whole-case action is a button inside the open case. The lift page shows the
stages from On order to In service with one sentence on what to do now, and on a
phone the next step stays in a bar at the bottom.

## Why

Assets today only describes a lift that is already sold and installed. Every
asset must have a customer, and status is Active, Inactive or Decommissioned.
Nothing covers the time between the factory and the building.

The company wants two things:

1. When a lift arrives, the store keeper checks what came, in the system,
   against the factory's packing list.
2. Everyone who has Assets today can see where a lift is and whether it has been
   sold. Assets access itself does not widen.

The source is the Suzhou FUJI packing list 2025-J048 (16 cases).

## Goals

- Registering a new lift gives it the full packing list as its checklist.
- The store keeper marks every row, and a whole case can be passed in one go.
- Shortages stay visible until sorted, on the lift and in the Assets list.
- Each lift shows where it is, and separately who it is sold to.
- Every status change and sale records who did it and when.
- Lifts already registered keep working, including their maintenance.

## Not now

- Stock ledger, reorders, factory orders or shipment tracking. The scope
  document keeps inventory under "Do not build yet", and this is one list per
  lift, not stock.
- Importing the factory's Excel file. It would give each lift its true list and
  quantities, and is the first thing to add once the manual version is in use.
- Adding or deleting rows on a lift, photos of damage, printing the checklist,
  alerts when something is short.
- Any change to the mobile sales app. The store keeper uses the admin UI.

## Must not happen

- 139 rows in one flat list.
- A shortage that blocks the lift from moving. Lifts go out short in real life;
  the flag must follow them.
- A lost tick when the power drops, so each mark saves on its own.
- A free status dropdown that lets a lift jump backwards unrecorded.
- A stock lift reaching a maintenance contract with no customer.

## What the user decided

- The store keeper does the check on arrival, in Assets.
- The checklist is there from when the lift is registered.
- All the packing list rows, not a short list (a 23-part cut was offered and
  turned down).
- Lifts are tracked through sold, in store and so on.

Everything below is my proposal. The user has seen the statuses and the
OK / Missing / Damaged marks and has not objected, but has not approved them.

## Where it is

The statuses, in order, with a button for the next allowed step only:

| Label | Stored as | Next step | Who presses it |
|---|---|---|---|
| On order | `ON_ORDER` | Checking | Store Keeper |
| Checking | `CHECKING` | In store | Store Keeper |
| In store | `IN_STORE` | At site | Store Keeper |
| At site | `AT_SITE` | In service, or back to In store | Technical Manager; Store Keeper for the return |
| In service | `ACTIVE` | Out of service, Decommissioned | Technical Manager, Maintenance Engineer; Decommissioned is Technical Manager only |
| Out of service | `INACTIVE` | In service, Decommissioned | As above |
| Decommissioned | `DECOMMISSIONED` | None | |

General Manager can press every button in the table, for any role.

A wrong press needs a way back, because the table has none from In service or
Checking. So the General Manager also gets **Correct status**: pick any status,
give a reason, and it is recorded in the history. It skips the rules below. It
is the only way to move a lift off the table's path.

`ACTIVE` and `INACTIVE` keep their stored values and only get new labels, so
existing lifts need no data change. The four new values are added to the
`asset_status` enum, which cannot be undone in Postgres.

Rules:

- Finishing the check needs every row marked. Missing or damaged rows are fine.
- Going to At site needs a customer.
- Follow `src/modules/projects/project-status.ts` for the transition table and
  `WorkflowTransitionError` (409) for a refused move.
- Status leaves the edit page and `UpdateAssetDto`. Only the status endpoint
  changes it.

## Sold to

A separate fact, because a lift can be sold while still at the factory or in
the store. It is the existing customer link, now optional, plus the existing
optional project link. Blank shows as "In stock".

- Set by Sales Manager or General Manager, on its own action. Registering an
  installed lift with its customer also counts, and is recorded.
- Sales Manager can change or clear it until the lift goes to At site, and again
  if the lift returns to In store. General Manager can change it at any status.
- Refused for everyone while the lift has a maintenance contract or a breakdown,
  because those records hold their own copy of the customer. Maintenance records
  are never rewritten.

## Registering a lift

The create form asks where the lift is starting from:

- **New from the factory** (default): status On order, no customer field, so it
  starts as In stock and Sales uses Sold to afterwards. Category Elevator has a
  "Use the packing list" tick, on by default. Untick it for a car lift, car
  platform or stacking lift: the list describes a traction passenger lift, with
  counterweight and ropes, so they get no checklist.
- **Already installed**: status In service, customer required, no checklist.
  This is today's route for lifts taken on for maintenance, for the same roles.
  Store Keeper does not see it, since they cannot read customers, and the API
  refuses it from them.

Other categories (escalator, stairs, other) go through the same statuses with
no checklist. The packing list does not describe them.

## The checklist

A fixed list in code, copied onto a lift when it is registered, one row per
lift. Later changes to the list do not touch lifts already registered.

- 134 rows: the 139 in `docs/planning/packing-list-2025-J048-checklist.csv`,
  less 5 that repeat a row in the same list with no quantity (case 1 item 11;
  case 4 items 2, 3, 4 and 43).
- Each row keeps case number, box name, item number, clear name, factory name,
  specification, unit, quantity, and the mark, note, who and when.
- Quantity is text, because the factory writes things like `4M=12, 2.5M=2` and
  `148+148`.
- Quantities start as they were on 2025-J048, a 7-floor 450 kg lift, so they are
  wrong for other lifts until corrected. The screen says so, and the store
  keeper corrects a quantity on its row from the paper list that came with the
  lift.

Marks: **OK, Missing, Damaged, Not in this lift**. The fourth is new since the
user saw this. A fixed list will not match every lift, and it keeps the record
without deleting rows.

- Unmarked until touched. A note is optional on any row.
- "All OK" on a case marks only its unmarked rows, so it never overwrites a
  Missing.
- A lift is flagged while any row is Missing or Damaged. When the part turns up,
  the store keeper changes the mark to OK, and the flag clears when none are
  left. Marks can change in any status.
- Store Keeper, Technical Manager and General Manager can mark rows.

## Screens

- **Assets list:** Status column with the new labels, a Sold to column ("In
  stock" when blank), a short-parts badge, and filters for status and
  sold / in stock. The list API returns the customer's name, so a Store Keeper
  sees who a lift is sold to, and only that: no access to Customers.
- **New page, `/assets/[id]/checklist`** (the list and edit pages link to it):
  the lift's name, status, sold-to, the next-step button, then the 16 cases as
  rows showing progress, such as "Case 4, Electrical parts, 12 of 48", and any
  shortage count. Opening a case shows its rows with the marks as buttons, the
  clear name first and the factory name under it, because about 20 clear names
  are readings of a poor translation. Must work at phone width, since a store
  keeper may do this on a phone beside the crates.
- **Status history:** a short list on the same page, newest first.
- **Edit page:** the Status field goes. This changes an existing screen, and the
  user should agree it when approving this document.

## What else this touches

- `assets.customer_id` stops being required. Composite foreign keys allow this.
  In `src/modules/assets/assets.repository.ts` only the export joins customers,
  so `list()` needs the join too.
- **Maintenance is the main risk.** `maintenance_contracts` and the breakdowns
  table both require a customer and copy `asset.customerId`
  (`src/modules/maintenance/maintenance.repository.ts:238`). A stock lift would
  fail with a database error. Refuse it with a clear message, and limit the web
  pickers to lifts with a customer. The pickers are in
  `web/src/app/maintenance/` (contracts, breakdowns, visits). Having a customer
  is the only test: a sold lift can get a contract before it is installed.
- The dashboard asset total (`dashboard.repository.ts:501`) will start counting
  lifts on order. It should stay at lifts In service or Out of service, or it
  will overstate what the company looks after.
- `web/src/lib/api.ts` types, `web/src/app/assets/labels.ts`, and the customer
  page, which lists a customer's assets with their status.
- Update `docs/planning/FEATURE-assets.md` and
  `docs/planning/ROLE-ACCESS-MATRIX.md`.

## Data

- New table for checklist rows and new table for the history of status and
  sold-to changes. Both follow the tenant rules: composite key
  `(tenant_id, id)`, row level security forced, `tenant_isolation` and
  `admin_bypass` policies (see `0082_shocking_justice.sql`).
- New migration only, numbered after 0089. Enum `ADD VALUE` follows
  `0066_user_role_general_manager.sql`.
- Registering a lift and creating its rows happen in one transaction.
- The application can only add to the history, and cannot delete checklist rows.
  Deleting a lift is recorded in the history too.

## Left to the builder

Endpoint shapes, table and column names, how the fixed list is laid out in code,
how the history table stores a sold-to change, the page's layout within the
admin UI conventions, and how the short-parts count is fetched for the list
without a query per row.

## Release

The API must go first, as usual, but removing `status` from the update DTO means
Save on the old edit page fails until the web deploy finishes. That is acceptable
on the demo for the few minutes between the two.

## Still to confirm with the client

These do not block building, and all are in the CSV's flag column:

- 16 rows on 2025-J048: no quantity, quantity 0, a quantity clash, or hidden on
  the printout. One hidden row may mean 22 more counterweight blocks.
- About 20 clear names are my reading of the translation.
- 6 bolt rows have no quantity.
