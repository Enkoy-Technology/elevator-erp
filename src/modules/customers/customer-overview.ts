import type { UserRole } from '../../types/auth.types';
import type {
  assets,
  contracts,
  invoices,
  maintenanceContracts,
  payments,
  proformas,
  projects,
  quotations,
} from '../../database/schema';

/**
 * The payload of `GET /customers/:id/overview` — one round trip that answers
 * "what is going on with this customer": eight related-record sections, each
 * a full `total` plus the `recent` five, newest first.
 *
 * Every field type is derived from the table's own `$inferSelect` rather than
 * restated, so a column type change (a new enum member, a nullability flip)
 * lands here instead of silently drifting. Where the response key differs
 * from the column name, the doc comment names the real column.
 *
 * Serialization note for the web client mirroring this: `timestamp` columns
 * are `Date` here and arrive as ISO strings over JSON, while `date` columns
 * (`signedAt`, `dueDate`, `nextServiceAt`) are already 'YYYY-MM-DD' strings.
 * Money is always a fixed-2-decimal string — never a number, never null.
 */
/**
 * Every section is OPTIONAL, and absent means "this caller may not see it".
 *
 * This endpoint is the only place in the codebase that reads eight modules'
 * data through one controller's gate, so it is the only place that can hand
 * a role something its own module would refuse. A dispatcher has no access
 * to quotations and no access to the AR ledger; reaching them by way of a
 * customer page must not be a way around that.
 *
 * Optional rather than empty: an empty section means "nothing here", which
 * is a fact about the customer. Absent means "not yours to see", which is a
 * fact about the caller, and the page renders them differently.
 */
export interface CustomerOverview {
  projects?: CustomerOverviewSection<CustomerOverviewProject>;
  quotations?: CustomerOverviewSection<CustomerOverviewQuotation>;
  proformas?: CustomerOverviewSection<CustomerOverviewProforma>;
  contracts?: CustomerOverviewSection<CustomerOverviewContract>;
  /** `outstandingEtb`: what this customer still owes across their invoices. */
  invoices?: CustomerOverviewSection<CustomerOverviewInvoice> & {
    outstandingEtb: string;
  };
  /** `receivedEtb`: what this customer has actually paid, net of reversals. */
  payments?: CustomerOverviewSection<CustomerOverviewPayment> & {
    receivedEtb: string;
  };
  assets?: CustomerOverviewSection<CustomerOverviewAsset>;
  maintenance?: CustomerOverviewSection<CustomerOverviewMaintenance>;
}

/** The sections, named. */
export const OVERVIEW_SECTIONS = [
  'projects',
  'quotations',
  'proformas',
  'contracts',
  'invoices',
  'payments',
  'assets',
  'maintenance',
] as const;

export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

/**
 * Which roles may see each section, copied from the class-level @Roles of
 * the controller that OWNS that data. Keep them in step: if one of those
 * controllers widens or narrows, this table has to follow, or the customer
 * page becomes the loophole.
 *
 * CEO and ADMIN are absent on purpose — RolesGuard's SUPER_ROLES pass
 * everything, and `visibleSections` applies that same rule rather than
 * restating the list here.
 */
const SECTION_ROLES: Record<OverviewSection, readonly UserRole[]> = {
  // ProjectsController / QuotationsController / ProformasController /
  // ContractsController
  projects: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  quotations: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  proformas: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  contracts: ['SALES_MANAGER', 'TECHNICAL_LEAD', 'FINANCE'],
  // InvoicesController / PaymentsController — the AR ledger is FINANCE only,
  // which is also why GET /customers/:id/statement carries @Roles('FINANCE').
  invoices: ['FINANCE'],
  payments: ['FINANCE'],
  // AssetsController
  assets: [
    'SALES_MANAGER',
    'TECHNICAL_LEAD',
    'FIELD_ENGINEER',
    'DISPATCHER',
    'WAREHOUSE_MANAGER',
  ],
  // MaintenanceController
  maintenance: ['TECHNICAL_LEAD', 'FIELD_ENGINEER', 'DISPATCHER', 'SALES_MANAGER'],
};

/** Mirrors RolesGuard's SUPER_ROLES. */
const SUPER_ROLES: readonly UserRole[] = ['CEO', 'ADMIN'];

/** The sections this role may be shown — and, therefore, the only ones worth querying. */
export const visibleSections = (role: UserRole): OverviewSection[] =>
  OVERVIEW_SECTIONS.filter(
    (section) =>
      SUPER_ROLES.includes(role) || SECTION_ROLES[section].includes(role),
  );

export interface CustomerOverviewSection<TRow> {
  /** The full count of matching rows, NOT `recent.length`. */
  total: number;
  /** At most `OVERVIEW_RECENT_LIMIT` rows, newest first. */
  recent: TRow[];
}

type ProjectRow = typeof projects.$inferSelect;
export interface CustomerOverviewProject {
  id: ProjectRow['id'];
  name: ProjectRow['name'];
  status: ProjectRow['status'];
  /** `projects.siteCity` — projects have no plain `city` column. */
  city: ProjectRow['siteCity'];
  /** `projects.contractAmountEtb`. */
  contractValueEtb: ProjectRow['contractAmountEtb'];
}

type QuotationRow = typeof quotations.$inferSelect;
export interface CustomerOverviewQuotation {
  id: QuotationRow['id'];
  quoteNumber: QuotationRow['quoteNumber'];
  status: QuotationRow['status'];
  totalPriceEtb: QuotationRow['totalPriceEtb'];
  createdAt: QuotationRow['createdAt'];
}

type ProformaRow = typeof proformas.$inferSelect;
export interface CustomerOverviewProforma {
  id: ProformaRow['id'];
  proformaNumber: ProformaRow['proformaNumber'];
  status: ProformaRow['status'];
  totalEtb: ProformaRow['totalEtb'];
  issuedAt: ProformaRow['issuedAt'];
}

type ContractRow = typeof contracts.$inferSelect;
export interface CustomerOverviewContract {
  id: ContractRow['id'];
  contractNumber: ContractRow['contractNumber'];
  status: ContractRow['status'];
  contractValueEtb: ContractRow['contractValueEtb'];
  /** Null while the contract is still DRAFT — hence ordering by `createdAt`. */
  signedAt: ContractRow['signedAt'];
}

type InvoiceRow = typeof invoices.$inferSelect;
export interface CustomerOverviewInvoice {
  id: InvoiceRow['id'];
  invoiceNumber: InvoiceRow['invoiceNumber'];
  status: InvoiceRow['status'];
  totalEtb: InvoiceRow['totalEtb'];
  dueDate: InvoiceRow['dueDate'];
}

type PaymentRow = typeof payments.$inferSelect;
export interface CustomerOverviewPayment {
  id: PaymentRow['id'];
  amountEtb: PaymentRow['amountEtb'];
  receivedAt: PaymentRow['receivedAt'];
  method: PaymentRow['method'];
}

type AssetRow = typeof assets.$inferSelect;
export interface CustomerOverviewAsset {
  id: AssetRow['id'];
  category: AssetRow['category'];
  buildingName: AssetRow['buildingName'];
  serialNumber: AssetRow['serialNumber'];
  status: AssetRow['status'];
}

type MaintenanceRow = typeof maintenanceContracts.$inferSelect;
export interface CustomerOverviewMaintenance {
  id: MaintenanceRow['id'];
  status: MaintenanceRow['status'];
  recurrence: MaintenanceRow['recurrence'];
  nextServiceAt: MaintenanceRow['nextServiceAt'];
  assetId: MaintenanceRow['assetId'];
}
