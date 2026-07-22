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

export const quoteStatusEnum = pgEnum('quote_status', [
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'PROFORMA',
  'CONTRACT',
  'CANCELLED',
]);

export const crewTypeEnum = pgEnum('crew_type', [
  'INSTALLATION',
  'MAINTENANCE',
  'EMERGENCY',
]);

export const installPhaseKindEnum = pgEnum('install_phase_kind', [
  'SHAFT_PREPARATION',
  'MECHANICAL_ASSEMBLY',
  'ELECTRICAL_WIRING',
  'TESTING_COMMISSIONING',
  'HANDOVER',
]);

export const installPhaseStatusEnum = pgEnum('install_phase_status', [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
]);
