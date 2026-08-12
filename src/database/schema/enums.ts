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

// Invoices are the ERP's own internal AR document, never the legal tax
// document (see docs/planning/DECISIONS-platform-and-ethiopian-compliance.md
// §4). VOID is a status, never a row deletion — see invoices.ts.
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'VOID',
]);

// Shared by payments.receivedVia and expenses.paidVia — the same six
// settlement rails apply to money coming in and going out.
export const paymentMethodEnum = pgEnum('payment_method', [
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'CBE_BIRR',
  'TELEBIRR',
  'OTHER',
]);

// Drives the WHT threshold lookup (goods vs services — see
// docs/planning/DECISIONS-platform-and-ethiopian-compliance.md §3):
// ETB 20,000 for goods, ETB 10,000 for services. The thresholds themselves
// live in the rate table (WHT_GOODS/WHT_SERVICES payloads), never here.
export const supplyKindEnum = pgEnum('supply_kind', ['GOODS', 'SERVICES']);

// Client-specific categories are pending real data — chosen generically
// from common Ethiopian SME expense lines, with OTHER as the catch-all.
export const expenseCategoryEnum = pgEnum('expense_category', [
  'MATERIALS',
  'TRANSPORT',
  'SALARY_ADVANCE',
  'RENT',
  'UTILITIES',
  'FUEL',
  'PER_DIEM',
  'OFFICE',
  'TAX',
  'OTHER',
]);

// REVERSED is not a state a row transitions into: REVERSED here labels a row
// as itself being a reversing entry (see expenses.ts's doc comment) — the
// original row keeps RECORDED forever, even once reversed.
export const expenseStatusEnum = pgEnum('expense_status', [
  'RECORDED',
  'REVERSED',
]);

export const bankTxKindEnum = pgEnum('bank_tx_kind', [
  'DEPOSIT',
  'WITHDRAWAL',
  'CHARGE',
  'TRANSFER_IN',
  'TRANSFER_OUT',
]);

// SMS is the only channel with a consumer today (Phase 5 T2); EMAIL is a
// later consumer — the outbox is generic from the start on purpose (see
// outbound-messages.ts's own doc comment) so adding email never means a
// schema migration.
export const messageChannelEnum = pgEnum('message_channel', ['SMS', 'EMAIL']);

// QUEUED -> SENDING (claimed by the dispatcher) -> SENT | back to QUEUED
// (retry with backoff) -> FAILED after the 4th failed attempt. See
// OutboxDispatcherService for the transition logic.
export const messageStatusEnum = pgEnum('message_status', [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
]);
