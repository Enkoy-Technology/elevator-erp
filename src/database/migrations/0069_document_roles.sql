-- The client's requirement document ("ERP System — Shining Star
-- Electromechanical Works") names eleven staff roles. The enum so far held
-- the older architecture document's nine. This renames the four that map
-- one-to-one, folds DISPATCHER into MAINTENANCE_ENGINEER (the document gives
-- service scheduling and emergency response to the maintenance engineer),
-- and adds the five the system never had: MARKETING_MANAGER, SALESPERSON,
-- OFFICE_MANAGER, SECRETARY, and the renamed FINANCE_OFFICER.
--
-- Postgres cannot drop or reorder enum values, so the type is rebuilt: the
-- column is cast through text with the old->new mapping, inside the
-- migration's transaction. `users.role` is the only column of this type and
-- no policy or index names a role value (checked: grep of migrations/).
-- Sessions issued before this ran carry an old role name in their JWT and
-- are refused until the person signs in again.
ALTER TYPE "public"."user_role" RENAME TO "user_role_old";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('CEO', 'GENERAL_MANAGER', 'MARKETING_MANAGER', 'SALES_MANAGER', 'SALESPERSON', 'FINANCE_OFFICER', 'OFFICE_MANAGER', 'TECHNICAL_MANAGER', 'MAINTENANCE_ENGINEER', 'STORE_KEEPER', 'SECRETARY', 'CUSTOMER', 'ADMIN');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."user_role" USING (
  CASE "role"::text
    WHEN 'TECHNICAL_LEAD' THEN 'TECHNICAL_MANAGER'
    WHEN 'FIELD_ENGINEER' THEN 'MAINTENANCE_ENGINEER'
    WHEN 'DISPATCHER' THEN 'MAINTENANCE_ENGINEER'
    WHEN 'FINANCE' THEN 'FINANCE_OFFICER'
    WHEN 'WAREHOUSE_MANAGER' THEN 'STORE_KEEPER'
    ELSE "role"::text
  END
)::"public"."user_role";--> statement-breakpoint
DROP TYPE "public"."user_role_old";
