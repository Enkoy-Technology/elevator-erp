# Lift Arrival Check and Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new lift is registered with its packing list, the store keeper checks it in, and everyone with Assets sees where it is and who it is sold to.

**Architecture:** Two new tenant tables hang off `assets`: checklist rows copied from a fixed list at registration, and a history of status and sold-to changes. The move rules live in one table in `asset-status.ts`. Checklist, status and sold-to get their own service, repository and controller beside the existing asset CRUD.

**Tech Stack:** NestJS 11, Drizzle, Postgres RLS, Next.js admin UI, Jest.

**Spec:** `docs/superpowers/specs/2026-11-06-lift-arrival-tracking-design.md`

## Global Constraints

- Every step is TDD where a test is named: see it fail, then pass.
- No commits. The project and user rules forbid committing until asked.
- Do not touch the car-size edits already in the working tree, or `HANDOFF.md`.
- Named exports only, no `any`, no imports between `src/modules/*`.
- `GENERAL_MANAGER` is not a super role: list it in `@Roles`. `CEO` and `ADMIN` pass every `@Roles` check, so the override list is `CEO`, `ADMIN`, `GENERAL_MANAGER`.
- A refused move is `WorkflowTransitionError` (409). Bad input is `BadRequestException`. A lift or row that does not exist, or is soft-deleted, is `NotFoundException`.
- Web tests only cover pure helpers in `web/src/lib` (see `jest.web.config.js`).

## Review Focus

- Two people on one case: "All OK" must only touch rows still unmarked, in the SQL itself. Test: e2e.
- A double press of the next-step button: the second gets a 409 and writes no second history row. The update is conditional on the old status. Test: e2e.
- A row id belonging to another lift, in the URL of this lift: 404, nothing changes. Test: e2e.
- A soft-deleted lift: the tracking read and every action give 404. Test: service spec.
- A mark that fails to save (power, network): the row must go back to what the server holds and say so, never stay shown as saved. Pure helper with a spec, used by the page.

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/database/schema/enums.ts`, `src/database/schema/assets.ts`
- Create: `src/database/migrations/0090_*.sql` (generated, then RLS appended), its snapshot and journal entry

**Interfaces:**
- Produces: enums `assetStatusEnum` with `ON_ORDER, CHECKING, IN_STORE, AT_SITE` before `ACTIVE`; `assetChecklistMarkEnum` (`OK, MISSING, DAMAGED, NOT_INCLUDED`); `assetEventKindEnum` (`REGISTERED, STATUS, CORRECTED, SOLD_TO`).
- Produces: tables `assetChecklistItems` and `assetEvents`, and `assets.customerId` nullable.
  - `asset_checklist_items`: `tenant_id, id, asset_id, case_no int, box_name, item_no, name, factory_name, specification, unit, quantity, position int, mark, note, checked_by_user_id, checked_at, created_at, updated_at`. Index `(tenant_id, asset_id, position)`. FK to assets and users, composite.
  - `asset_events`: `tenant_id, id, asset_id, kind, from_status, to_status, customer_id, note, created_by_user_id, created_at`. Index `(tenant_id, asset_id, created_at)`. FKs composite.

- [ ] **Step 1:** Edit the two schema files. Keep the DB default on `assets.status` as `ACTIVE`.
- [ ] **Step 2:** Run `pnpm run db:generate`. Expected: one new `0090_*.sql`.
- [ ] **Step 3:** Append to the SQL, for both tables, the RLS block from `0082_shocking_justice.sql` (`ENABLE`, `FORCE`, `tenant_isolation`, `admin_bypass`). Confirm enum lines read `ADD VALUE ... BEFORE 'ACTIVE'`.
- [ ] **Step 4:** Run `pnpm run db:migrate`. Expected: applied with no error.
- [ ] **Step 5:** Run `pnpm run typecheck`. Expected: errors only where `customerId` is now nullable; these are fixed in Tasks 3 and 6.

### Task 2: The fixed list and the move table

**Files:**
- Create: `src/modules/assets/arrival-checklist.ts`, `src/modules/assets/arrival-checklist.spec.ts`
- Create: `src/modules/assets/asset-status.ts`, `src/modules/assets/asset-status.spec.ts`

**Interfaces:**
- Produces: `ARRIVAL_CHECKLIST: readonly ArrivalChecklistRow[]`, with `{ caseNo: number; boxName: string; itemNo: string; name: string; factoryName: string; specification: string | null; unit: string | null; quantity: string | null }`. Generate it once from the CSV with a scratch script, dropping case 1 item 11 and case 4 items 2, 3, 4, 43. Ordered by case, then file order.
- Produces: `ASSET_STATUS_MOVES`, `allowedAssetMoves(status: AssetStatus, role: UserRole): AssetStatus[]`, `ASSET_OVERRIDE_ROLES`, `PRE_SITE_STATUSES` (`ON_ORDER, CHECKING, IN_STORE`).

- [ ] **Step 1: Write the failing tests**

```ts
expect(ARRIVAL_CHECKLIST).toHaveLength(134);
expect(countByCase(4)).toBe(48);
expect(countByCase(5)).toBe(54);
expect(new Set(ARRIVAL_CHECKLIST.map((r) => r.caseNo)).size).toBe(16);
expect(unique(ARRIVAL_CHECKLIST.map((r) => `${r.caseNo}/${r.itemNo}`))).toHaveLength(134);

expect(allowedAssetMoves('ON_ORDER', 'STORE_KEEPER')).toEqual(['CHECKING']);
expect(allowedAssetMoves('ON_ORDER', 'TECHNICAL_MANAGER')).toEqual([]);
expect(allowedAssetMoves('AT_SITE', 'STORE_KEEPER')).toEqual(['IN_STORE']);
expect(allowedAssetMoves('AT_SITE', 'TECHNICAL_MANAGER')).toEqual(['ACTIVE']);
expect(allowedAssetMoves('AT_SITE', 'GENERAL_MANAGER')).toEqual(['ACTIVE', 'IN_STORE']);
expect(allowedAssetMoves('ACTIVE', 'MAINTENANCE_ENGINEER')).toEqual(['INACTIVE']);
expect(allowedAssetMoves('INACTIVE', 'TECHNICAL_MANAGER')).toEqual(['ACTIVE', 'DECOMMISSIONED']);
expect(allowedAssetMoves('DECOMMISSIONED', 'CEO')).toEqual([]);
```

- [ ] **Step 2:** Run `pnpm test src/modules/assets/arrival-checklist src/modules/assets/asset-status`. Expected: FAIL, modules missing.
- [ ] **Step 3:** Write both files.
- [ ] **Step 4:** Rerun. Expected: PASS.

### Task 3: Registering a lift, the list API, maintenance guard, dashboard

**Files:**
- Modify: `src/modules/assets/dto/asset.dto.ts`, `assets.repository.ts`, `assets.service.ts`, `assets.controller.ts`
- Create: `src/modules/assets/assets.service.spec.ts`
- Modify: `src/modules/maintenance/maintenance.repository.ts` (`createContract`, `createBreakdown`), its spec
- Modify: `src/modules/dashboard/dashboard.repository.ts`

**Interfaces:**
- Produces: `CreateAssetDto.customerId?`, `startingPoint?: 'FROM_FACTORY' | 'INSTALLED'` (omitted means `INSTALLED`, so old callers keep working), `usePackingList?: boolean`.
- Produces: `status` removed from `UpdateAssetDto`. `ASSET_STATUSES` gains the four values.
- Produces: `AssetListRow = AssetRecord & { customerName: string | null; shortParts: number }` from `list()`, with new filters `status?: AssetStatus` and `sold?: boolean`.

- [ ] **Step 1: Write the failing service tests**: `FROM_FACTORY` with a `customerId` gives 400; `INSTALLED` without one gives 400; `FROM_FACTORY` passes `status: 'ON_ORDER'` and the checklist to the repository for `ELEVATOR`; passes no checklist when `usePackingList` is false, or for `ESCALATOR`; `INSTALLED` passes `status: 'ACTIVE'` and no checklist.
- [ ] **Step 2: Write the failing maintenance tests**: `createContract` and `createBreakdown` on an asset with `customerId: null` throw `BadRequestException` with "This lift has no customer yet. Mark who it is sold to first." and insert nothing.
- [ ] **Step 3:** Run them. Expected: FAIL.
- [ ] **Step 4:** Implement. `AssetsRepository.create(tenantId, userId, dto, { status, checklist })` inserts the asset, the rows (`position` is the array index) and a `REGISTERED` event in one `withTenant`. `list()` left-joins customers, and takes `shortParts` from a correlated `count(*)` on rows marked `MISSING` or `DAMAGED`. Parse the new `status` and `sold` query params in the controller, passing them to `streamAll` as well. The dashboard total filters to `ACTIVE`, `INACTIVE`.
- [ ] **Step 5:** Run `pnpm test src/modules/assets src/modules/maintenance src/modules/dashboard`. Expected: PASS.

### Task 4: Tracking service: status, sold to, checklist

**Files:**
- Create: `src/modules/assets/asset-tracking.repository.ts`, `asset-tracking.service.ts`, `asset-tracking.service.spec.ts`, `asset-tracking.controller.ts`
- Modify: `src/modules/assets/dto/asset.dto.ts`, `src/modules/assets/assets.module.ts`

**Interfaces:**
- Consumes: `allowedAssetMoves`, `ASSET_OVERRIDE_ROLES`, `PRE_SITE_STATUSES`.
- Produces routes, all `ParseUUIDPipe` on ids:
  - `GET /assets/:id/tracking` → `{ asset: AssetRecord & { customerName }, items, events, nextMoves }`. All Assets roles.
  - `POST /assets/:id/status` `{ to, note? }`. Store Keeper, Technical Manager, Maintenance Engineer, General Manager.
  - `POST /assets/:id/status/correct` `{ to, reason }` (reason 3 to 500 chars). General Manager.
  - `PUT /assets/:id/sold-to` `{ customerId: uuid | null, projectId?: uuid | null }`. Sales Manager, General Manager.
  - `PATCH /assets/:id/checklist/:itemId` `{ mark?, quantity?, note? }`, where `mark` cannot be null. Store Keeper, Technical Manager, General Manager.
  - `POST /assets/:id/checklist/cases/:caseNo/all-ok` → `{ marked: number }`, same roles. `caseNo` through `ParseIntPipe`.

- [ ] **Step 1: Write the failing service tests**
  - `getTracking` on a missing or soft-deleted lift: 404.
  - `move`: a role with no such move gets `WorkflowTransitionError`.
  - `move` from `CHECKING` to `IN_STORE` with 3 unmarked rows: refused, message names 3. With shortages and 0 unmarked: passes.
  - `move` to `AT_SITE` with no customer: refused. With a customer: passes.
  - `move` where the conditional update changes nothing: refused.
  - `correct`: any status to any status, skipping the rules, writes a `CORRECTED` event carrying the reason. Refused if `to` equals the current status.
  - `setSoldTo`: maintenance records exist, refused for everyone, General Manager included.
  - `setSoldTo`: Sales Manager at `AT_SITE` refused, at `IN_STORE` allowed, General Manager at `ACTIVE` allowed.
  - `setSoldTo`: unknown customer, or a project of another customer: 400. `customerId: null` clears the project too.
- [ ] **Step 2:** Run `pnpm test src/modules/assets/asset-tracking`. Expected: FAIL.
- [ ] **Step 3:** Implement. Repository methods: `findWithCustomer`, `listItems`, `listEvents` (newest first, joined to user and customer names), `countUnmarked`, `moveStatus(tenantId, id, from, to, kind, userId, note): boolean` (`UPDATE ... WHERE status = from`, event in the same transaction), `hasMaintenanceRecords` (rows in `maintenance_contracts` or `breakdowns` not soft-deleted), `setSoldTo`, `updateItem(tenantId, assetId, itemId, patch, userId)` (scoped by both ids, sets `checked_by_user_id` and `checked_at` when `mark` is given), `markCaseOk` (`WHERE mark IS NULL`).
- [ ] **Step 4:** Rerun. Expected: PASS.

### Task 5: End-to-end proof

**Files:**
- Create: `test/e2e/asset-arrival.e2e-spec.ts`, same setup as `site-survey-convert.e2e-spec.ts`.

- [ ] **Step 1: Write the tests**, running the real repositories as `app_user`:
  - Registering from the factory creates 134 rows and a `REGISTERED` event.
  - "All OK" on case 4 after one row is marked `MISSING` changes 47 rows and leaves `MISSING`.
  - `moveStatus` called twice with the same `from`: second returns false, one `STATUS` event.
  - `updateItem` with this lift's id and another lift's row id: changes nothing, returns null.
  - A second tenant sees no rows of the first (`listItems` empty).
  - `shortParts` in `list()` is 1 after the mark above.
- [ ] **Step 2:** Run `pnpm run test:e2e -- asset-arrival`. Expected: PASS.

### Task 6: Web: types, labels, list, forms, pickers

**Files:**
- Modify: `web/src/lib/api.ts`, `web/src/app/assets/labels.ts`, `web/src/app/assets/page.tsx`, `web/src/app/assets/new/page.tsx`, `web/src/app/assets/[id]/edit/page.tsx`
- Modify: `web/src/app/maintenance/contracts/new/page.tsx`, `web/src/app/maintenance/breakdowns/new/page.tsx`

**Interfaces:**
- Produces in `api.ts`: `AssetChecklistItem`, `AssetEvent`, `AssetTracking`, `ChecklistMark`, `getAssetTracking`, `moveAsset`, `correctAssetStatus`, `setAssetSoldTo`, `updateChecklistItem`, `markChecklistCaseOk`; `listAssets` gains `status` and `sold`.
- Labels: `ACTIVE` is "In service", `INACTIVE` is "Out of service".

- [ ] **Step 1:** Update `api.ts` and labels. Run `pnpm --dir web exec tsc --noEmit`, and use its errors to find every status map.
- [ ] **Step 2:** List page: the Customer column becomes Sold to (`customerName ?? 'In stock'`); a short-parts pill beside the status; Status and Sold filters; a Check parts row action opening `/assets/[id]/checklist` for all viewers. Update the page description, which says "under contract".
- [ ] **Step 3:** New page: "Where is this lift starting from?" radios; customer shown only for Already installed; that option hidden for `STORE_KEEPER`; "Use the packing list" tick for New from the factory and category Elevator. After registering from the factory, go to the checklist page.
- [ ] **Step 4:** Edit page: remove Status. The description no longer says "Link equipment to a customer".
- [ ] **Step 5:** Maintenance pickers call `listAssets({ sold: true, page: 1, pageSize: 100 })`.
- [ ] **Step 6:** Web typecheck and lint pass.

### Task 7: Web: the checklist page

**Files:**
- Create: `web/src/lib/asset-checklist.ts`, `web/src/lib/asset-checklist.spec.ts`
- Create: `web/src/app/assets/[id]/checklist/page.tsx`, `web/src/app/assets/[id]/checklist/case-section.tsx`

**Interfaces:**
- Produces: `summariseCases(items): CaseSummary[]` with `{ caseNo, boxNames, total, marked, short }`, and `withMark(items, itemId, mark): items`, used to show a mark at once and put the old list back when the save fails.

- [ ] **Step 1: Write the failing tests**: `summariseCases` gives one entry per case, ordered by case number, counts `MISSING` and `DAMAGED` as short and `NOT_INCLUDED` as marked; `withMark` returns a new array with only that row changed.
- [ ] **Step 2:** Run `pnpm test web/src/lib/asset-checklist`. Expected: FAIL. Then implement, and rerun for PASS.
- [ ] **Step 3:** Build the page. Header: lift name, status pill, sold to, next-step buttons from `nextMoves`, Sold to control for Sales Manager and General Manager, Correct status for General Manager (`useConfirm` with `input`, status via a select). A notice that quantities start from a 7-floor 450 kg lift. The 16 cases as rows that open. In a case: rows grouped by `boxName`, clear name, factory name under it, specification, quantity box (saved on blur), four mark buttons, note. "All OK" per case. History list at the end. Text wraps at phone width.
- [ ] **Step 4:** Check it in a real browser at desktop and phone width, as Store Keeper and General Manager, against local dev.

### Task 8: Docs and final checks

**Files:**
- Modify: `docs/planning/FEATURE-assets.md`, `docs/planning/ROLE-ACCESS-MATRIX.md`, `web/src/app/docs/content.ts` (the Assets section, line 954 on)

- [ ] **Step 1:** Update the three documents.
- [ ] **Step 2:** Run code-reviewer, security-auditor and performance-analyzer in parallel, and fix what they find.
- [ ] **Step 3:** Run build-validator and test-runner in parallel. Expected: `pnpm test`, `pnpm run test:e2e`, lint, typecheck and build all clean.
