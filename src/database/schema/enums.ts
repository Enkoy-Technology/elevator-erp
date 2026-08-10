import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [
  'CEO',
  'SALES_MANAGER',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'FINANCE',
  'WAREHOUSE_MANAGER',
  'DISPATCHER',
  'CUSTOMER',
  'ADMIN',
]);

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'STARTER',
  'GROWTH',
  'ENTERPRISE',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
]);

export const customerTypeEnum = pgEnum('customer_type', [
  'RESIDENTIAL',
  'COMMERCIAL',
  'GOVERNMENT',
]);

export const projectStatusEnum = pgEnum('project_status', [
  'LEAD',
  'SITE_SURVEY',
  'SPEC_CALCULATION',
  'QUOTATION',
  'PROFORMA',
  'CONTRACT',
  'EXECUTION',
  'COMPLETED',
  'CANCELLED',
]);

// Restored from the pre-lean-MVP quotations module (git show f0fea5c^) with
// the lifecycle re-shaped: PENDING_APPROVAL is a new explicit submit step
// (old: DRAFT -> APPROVED directly), EXPIRED is new, PROFORMA is renamed
// CONVERTED_TO_PROFORMA (conversion itself is Task 2), and the old CONTRACT/
// CANCELLED terminal statuses are dropped — contract lifecycle lives on
// projects.status now, and nothing in this restore needs a cancel path.
export const quoteStatusEnum = pgEnum('quote_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CONVERTED_TO_PROFORMA',
]);

// ISSUED/CANCELLED only: proformas are an append-only book (no delete);
// cancelling an issued proforma does not revert the source quotation — see
// ProformasRepository.cancel.
export const proformaStatusEnum = pgEnum('proforma_status', [
  'ISSUED',
  'CANCELLED',
]);

export const assetCategoryEnum = pgEnum('asset_category', [
  'ELEVATOR',
  'ESCALATOR',
  'STAIRS',
  'OTHER',
]);

export const assetStatusEnum = pgEnum('asset_status', [
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'GENERAL',
  'QUOTE',
  'ASSIGNMENT',
  'MAINTENANCE',
]);

export const maintenanceRecurrenceEnum = pgEnum('maintenance_recurrence', [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'BIANNUAL',
  'ANNUAL',
]);

export const maintenanceContractStatusEnum = pgEnum(
  'maintenance_contract_status',
  ['ACTIVE', 'PAUSED', 'ENDED'],
);

export const breakdownSeverityEnum = pgEnum('breakdown_severity', [
  'EMERGENCY',
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]);

export const breakdownStatusEnum = pgEnum('breakdown_status', [
  'OPEN',
  'ASSIGNED',
  'DONE',
]);
