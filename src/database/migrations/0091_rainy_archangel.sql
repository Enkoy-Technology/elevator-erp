ALTER TYPE "public"."asset_event_kind" ADD VALUE 'DELETED';--> statement-breakpoint
-- History is only ever added to, and a checklist row is marked, never removed.
-- A table keeps all four default privileges unless revoked (see 0035, 0059).
REVOKE UPDATE, DELETE ON asset_events FROM app_user;--> statement-breakpoint
REVOKE DELETE ON asset_checklist_items FROM app_user;
