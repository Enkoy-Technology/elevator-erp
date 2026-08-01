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
