const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/v1';

const ACCESS_KEY = 'erp.accessToken';
const REFRESH_KEY = 'erp.refreshToken';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface AuthProfile {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  lastLoginAt: string | null;
}

/** RFC 7807 Problem Details, as emitted by the API's exception filter. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
}

/** Advisory look-alike hit from POST /customers/check-duplicate. */
export interface SimilarCustomer {
  id: string;
  name: string;
  phone: string | null;
  city: string | null;
}

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
  }
}

export const getAccessToken = (): string | null =>
  typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);

export type UserRole =
  | 'CEO'
  | 'GENERAL_MANAGER'
  | 'ADMIN'
  | 'SALES_MANAGER'
  | 'TECHNICAL_LEAD'
  | 'FIELD_ENGINEER'
  | 'FINANCE'
  | 'WAREHOUSE_MANAGER'
  | 'DISPATCHER'
  | 'CUSTOMER';

/**
 * Role straight off the access token, for deciding what to render. Presentation
 * only — the API re-checks every request, so a tampered token changes what this
 * browser draws and nothing else.
 */
export const getCurrentRole = (): UserRole | null => {
  const payload = getAccessToken()?.split('.')[1];
  if (!payload) {
    return null;
  }
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { role?: UserRole }).role ?? null;
  } catch {
    return null;
  }
};

const getRefreshToken = (): string | null =>
  typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);

const storeTokens = (tokens: TokenPair): void => {
  localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
};

export const clearTokens = (): void => {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
};

const parseProblem = async (response: Response): Promise<ProblemDetails> => {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return {
      type: 'about:blank',
      title: response.statusText,
      status: response.status,
      detail: `Request failed with status ${response.status}`,
      instance: response.url,
    };
  }
};

const doRefresh = async (): Promise<boolean> => {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    clearTokens();
    return false;
  }
  storeTokens((await response.json()) as TokenPair);
  return true;
};

// Refresh tokens rotate server-side, so two concurrent refreshes would
// invalidate each other and log the user out. All 401s share one in-flight
// refresh instead.
// ponytail: per-tab lock only — two open tabs can still race the rotation;
// add a BroadcastChannel lock if stray logouts are ever reported.
let refreshInFlight: Promise<boolean> | null = null;

const refreshTokens = (): Promise<boolean> => {
  refreshInFlight ??= doRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

/**
 * Authenticated fetch against the ERP API. On a 401 it attempts one
 * refresh-token rotation and retries; if that fails the tokens are cleared
 * and the caller should redirect to /login.
 */
export const apiFetch = async <T>(
  path: string,
  init: RequestInit = {},
  retryOn401 = true,
): Promise<T> => {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && retryOn401 && (await refreshTokens())) {
    return apiFetch<T>(path, init, false);
  }
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
};

export const login = async (
  tenantSlug: string,
  email: string,
  password: string,
): Promise<TokenPair> => {
  const tokens = await apiFetch<TokenPair>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ tenantSlug, email, password }),
    },
    false,
  );
  storeTokens(tokens);
  return tokens;
};

export const logout = async (): Promise<void> => {
  try {
    await apiFetch<void>('/auth/logout', { method: 'POST' }, false);
  } catch {
    // Best effort — clear local state regardless.
  }
  clearTokens();
};

export const getProfile = (): Promise<AuthProfile> =>
  apiFetch<AuthProfile>('/auth/me');

export const PRODUCT_TYPES = [
  'PASSENGER',
  'CAR_PLATFORM_LIFT',
  'ESCALATOR',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  PASSENGER: 'Passenger / hospital elevator',
  CAR_PLATFORM_LIFT: 'Car platform lift',
  ESCALATOR: 'Escalator',
};

export interface CalcInputPayload {
  productType: ProductType;
  capacityKg: number;
  stops: number;
  travelHeightM: number;
  speedMs: number;
  machineRoomType: 'MR' | 'MRL';
  doorType: 'CENTER_OPEN' | 'TELESCOPIC' | 'SWING';
  doorWidthMm: number;
  buildingUsage: 'RESIDENTIAL' | 'COMMERCIAL' | 'HOSPITAL' | 'INDUSTRIAL';
  marginPercent: number;
  taxPercent: number;
}

export interface CalcResult {
  // Every technical field except productType is null for non-PASSENGER
  // products — §4.1 is EN 81 lift geometry and an escalator has none of it.
  technical: {
    productType: ProductType;
    capacityPersons: number | null;
    carWidthMm: number | null;
    carDepthMm: number | null;
    carHeightMm: number | null;
    shaftWidthMm: number | null;
    shaftDepthMm: number | null;
    pitDepthMm: number | null;
    overheadClearanceMm: number | null;
    counterweightMassKg: string | null;
    motorPowerKw: string | null;
    guideRailSpec: string | null;
    machineRoomWidthMm: number | null;
    machineRoomDepthMm: number | null;
    machineRoomHeightMm: number | null;
  };
  pricing: {
    basePrice: string;
    stopsAdjustment: string;
    capacityAdjustment: string;
    totalBeforeMargin: string;
    marginAmount: string;
    subtotalWithMargin: string;
    taxAmount: string;
    totalPrice: string;
  };
}

export const calculateSpecs = (
  input: CalcInputPayload,
): Promise<CalcResult> =>
  apiFetch<CalcResult>('/elevator-specs/calculate', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Wrap a reference-data fetch (dropdown options, id→name maps) so a 403 or an
 * outage degrades that one list to empty instead of failing the whole page.
 * The endpoints behind these lists are gated to narrower roles than the pages
 * that display them, so this is the normal path, not just an error path.
 */
export const optional = <T>(
  request: Promise<Paginated<T>>,
): Promise<Paginated<T>> =>
  request.catch(() => ({
    items: [] as T[],
    page: 1,
    pageSize: 0,
    total: 0,
    totalPages: 0,
  }));

export type CustomerType = 'RESIDENTIAL' | 'COMMERCIAL' | 'GOVERNMENT';

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  legalName: string | null;
  email: string | null;
  phone: string | null;
  alternatePhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  country: string;
  buildingName: string | null;
  customerType: CustomerType;
  creditLimitEtb: string;
  /** numeric(5,0) — a string like every other numeric column, not a number. */
  paymentTermsDays: string;
  /** Net account position (invoices owed minus unapplied cash) — not the same as the aging report's per-invoice total; the two legitimately disagree by unapplied cash. */
  outstandingBalanceEtb: string;
  /** ECA Directive 832/2021 recorded consent to receive SMS — null until given. Server-stamped only (see CreateCustomerPayload.smsConsentGiven's own doc comment); never set this directly. */
  smsConsentAt: string | null;
  /** When consent was revoked — null means never revoked (or never given). Revoking no longer clears smsConsentAt above (I10), so both fields matter for the current consent state. */
  smsConsentRevokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerPayload {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  customerType?: CustomerType;
  notes?: string;
  /** Set true once the customer has given recorded consent to receive SMS. Set false to revoke. The server stamps the current time — never send a timestamp here. */
  smsConsentGiven?: boolean;
}

export const listCustomers = (options?: {
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Customer>> => {
  const params = new URLSearchParams();
  if (options?.search?.trim()) {
    params.set('q', options.search.trim());
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Customer>>(
    `/customers${query ? `?${query}` : ''}`,
  );
};

export const checkCustomerDuplicate = (payload: {
  name: string;
  phone?: string;
}): Promise<SimilarCustomer[]> =>
  apiFetch<SimilarCustomer[]>('/customers/check-duplicate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const createCustomer = (
  payload: CreateCustomerPayload,
): Promise<Customer> =>
  apiFetch<Customer>('/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** GET /customers/:id — the single record behind the detail and edit pages. */
export const getCustomer = (id: string): Promise<Customer> =>
  apiFetch<Customer>(`/customers/${encodeURIComponent(id)}`);

export const updateCustomer = (
  id: string,
  payload: Partial<CreateCustomerPayload>,
): Promise<Customer> =>
  apiFetch<Customer>(`/customers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteCustomer = (id: string): Promise<void> =>
  apiFetch<void>(`/customers/${id}`, { method: 'DELETE' });

/**
 * GET /customers/:id/overview — the one round trip behind the customer
 * detail page. Every section carries the FULL `total` plus the newest five
 * rows, so the heading count and the five-row table can never disagree.
 *
 * Mirrors CustomerOverview in src/modules/customers/customer-overview.ts.
 * Money is always a fixed-2-decimal string; `timestamp` columns arrive as
 * ISO strings and `date` columns (signedAt, dueDate, nextServiceAt) as
 * plain 'YYYY-MM-DD'.
 */
export interface CustomerOverviewSection<TRow> {
  /** Every matching row, NOT `recent.length`. */
  total: number;
  /** At most five, newest first. */
  recent: TRow[];
}

export interface CustomerOverviewProject {
  id: string;
  name: string;
  status: ProjectStatus;
  /** projects.siteCity. */
  city: string | null;
  /** projects.contractAmountEtb. */
  contractValueEtb: string | null;
}

export interface CustomerOverviewQuotation {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  totalPriceEtb: string;
  createdAt: string;
}

export interface CustomerOverviewProforma {
  id: string;
  proformaNumber: string;
  status: ProformaStatus;
  totalEtb: string;
  issuedAt: string;
}

export interface CustomerOverviewContract {
  id: string;
  contractNumber: string;
  status: ContractStatus;
  contractValueEtb: string;
  /** Null while the contract is still DRAFT. */
  signedAt: string | null;
}

export interface CustomerOverviewInvoice {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  totalEtb: string;
  dueDate: string | null;
}

export interface CustomerOverviewPayment {
  id: string;
  amountEtb: string;
  receivedAt: string;
  method: PaymentMethod;
}

export interface CustomerOverviewAsset {
  id: string;
  category: AssetCategory;
  buildingName: string | null;
  serialNumber: string | null;
  status: AssetStatus;
}

export interface CustomerOverviewMaintenance {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  recurrence: MaintenanceRecurrence;
  nextServiceAt: string;
  assetId: string;
}

/**
 * Every section is OPTIONAL, and absent means "this role may not see it" —
 * the API omits sections the caller's role could not read from the module
 * that owns them (visibleSections() in src/modules/customers). Absent is not
 * the same as empty: empty says this customer has none, absent says it is not
 * yours to know, and the page must not render one as the other.
 */
export interface CustomerOverview {
  projects?: CustomerOverviewSection<CustomerOverviewProject>;
  quotations?: CustomerOverviewSection<CustomerOverviewQuotation>;
  proformas?: CustomerOverviewSection<CustomerOverviewProforma>;
  contracts?: CustomerOverviewSection<CustomerOverviewContract>;
  /** `outstandingEtb`: what this customer still owes across their invoices —
   *  the aging report's per-invoice figure, not Customer.outstandingBalanceEtb
   *  (which also nets off unapplied cash). */
  invoices?: CustomerOverviewSection<CustomerOverviewInvoice> & {
    outstandingEtb: string;
  };
  /** `receivedEtb`: what they have actually paid, net of reversals. */
  payments?: CustomerOverviewSection<CustomerOverviewPayment> & {
    receivedEtb: string;
  };
  assets?: CustomerOverviewSection<CustomerOverviewAsset>;
  maintenance?: CustomerOverviewSection<CustomerOverviewMaintenance>;
}

export const getCustomerOverview = (id: string): Promise<CustomerOverview> =>
  apiFetch<CustomerOverview>(
    `/customers/${encodeURIComponent(id)}/overview`,
  );

export type ProjectStatus =
  | 'LEAD'
  | 'SITE_SURVEY'
  | 'SPEC_CALCULATION'
  | 'QUOTATION'
  | 'PROFORMA'
  | 'CONTRACT'
  | 'EXECUTION'
  | 'COMPLETED'
  | 'CANCELLED';

export interface Project {
  id: string;
  tenantId: string;
  customerId: string;
  name: string;
  code: string | null;
  status: ProjectStatus;
  siteCity: string | null;
  siteCountry: string;
  quotedAmountEtb: string | null;
  contractAmountEtb: string | null;
  createdAt: string;
  updatedAt: string;
  statusChangedAt: string;
}

export interface CreateProjectPayload {
  customerId: string;
  name: string;
  code?: string;
  siteCity?: string;
  buildingName?: string;
  notes?: string;
}

export const listProjects = (options?: {
  status?: ProjectStatus;
  customerId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Project>> => {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Project>>(
    `/projects${query ? `?${query}` : ''}`,
  );
};

export const createProject = (
  payload: CreateProjectPayload,
): Promise<Project> =>
  apiFetch<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateProjectStatus = (
  id: string,
  status: ProjectStatus,
  amounts?: { quotedAmountEtb?: string; contractAmountEtb?: string },
): Promise<Project> =>
  apiFetch<Project>(`/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...amounts }),
  });

/** Next allowed statuses for UI advance buttons (mirrors API DAG). */
export const NEXT_PROJECT_STATUSES: Record<
  ProjectStatus,
  readonly ProjectStatus[]
> = {
  LEAD: ['SITE_SURVEY', 'CANCELLED'],
  SITE_SURVEY: ['SPEC_CALCULATION', 'CANCELLED'],
  SPEC_CALCULATION: ['QUOTATION', 'CANCELLED'],
  QUOTATION: ['PROFORMA', 'CANCELLED'],
  PROFORMA: ['CONTRACT', 'CANCELLED'],
  CONTRACT: ['EXECUTION', 'CANCELLED'],
  EXECUTION: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};


export const EMPLOYEE_ROLES = [
  'CEO',
  'GENERAL_MANAGER',
  'SALES_MANAGER',
  'TECHNICAL_LEAD',
  'FIELD_ENGINEER',
  'FINANCE',
  'WAREHOUSE_MANAGER',
  'DISPATCHER',
  'ADMIN',
] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export interface Employee {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: EmployeeRole;
  isActive: boolean;
  /** ECA Directive 832/2021 recorded consent to receive SMS (protects staff the same way it protects customers) — null until given. Server-stamped only; never set this directly. */
  smsConsentAt: string | null;
  /** When consent was revoked — null means never revoked (or never given). See Customer.smsConsentRevokedAt's own doc comment (I10). */
  smsConsentRevokedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEmployeePayload {
  email: string;
  fullName: string;
  phone?: string;
  role: EmployeeRole;
  password: string;
  /** Set true once this technician/staff member has given recorded consent to receive SMS at creation time — matches CreateCustomerPayload. The server stamps the current time. */
  smsConsentGiven?: boolean;
}

export const listEmployees = (options?: {
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Employee>> => {
  const params = new URLSearchParams();
  if (options?.q) {
    params.set('q', options.q);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Employee>>(
    `/employees${query ? `?${query}` : ''}`,
  );
};

export const createEmployee = (
  payload: CreateEmployeePayload,
): Promise<Employee> =>
  apiFetch<Employee>('/employees', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateEmployee = (
  id: string,
  payload: {
    fullName?: string;
    phone?: string;
    role?: EmployeeRole;
    isActive?: boolean;
    password?: string;
    /** Set true once this technician/staff member has given recorded consent to receive SMS. Set false to revoke. The server stamps the current time — never send a timestamp here. */
    smsConsentGiven?: boolean;
  },
): Promise<Employee> =>
  apiFetch<Employee>(`/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** One sheet row's verdict from POST /employees/import. */
export interface EmployeeImportRow {
  /** 1-based row in the uploaded sheet, so a person can find it and fix it. */
  rowNumber: number;
  fullName: string | null;
  email: string | null;
  /** As written in the sheet, before mapping to an EmployeeRole. */
  role: string | null;
  status: 'READY' | 'CREATED' | 'SKIPPED_DUPLICATE' | 'ERROR';
  message?: string;
  /** Server-generated, returned ONCE on commit for CREATED rows. Never store or log it. */
  temporaryPassword?: string;
}

export interface EmployeeImportResult {
  dryRun: boolean;
  totalRows: number;
  /** Always 0 on a dry run. */
  created: number;
  rows: EmployeeImportRow[];
}

/**
 * Upload a staff spreadsheet. Default is a DRY RUN: the server validates and
 * reports per row, writing nothing. `commit` writes, in one transaction.
 *
 * apiFetch can't be used here — it forces `Content-Type: application/json`,
 * and a multipart body must be left alone so the browser can set the boundary.
 * Same 401-refresh-and-retry dance as fetchDocument; the FormData is rebuilt
 * on the retry rather than replayed.
 */
export const importEmployees = async (
  file: File,
  commit = false,
  retryOn401 = true,
): Promise<EmployeeImportResult> => {
  const body = new FormData();
  body.append('file', file);
  if (commit) {
    body.append('commit', 'true');
  }
  const token = getAccessToken();
  const response = await fetch(`${API_URL}/employees/import`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });
  if (response.status === 401 && retryOn401 && (await refreshTokens())) {
    return importEmployees(file, commit, false);
  }
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  return (await response.json()) as EmployeeImportResult;
};

export const ASSET_CATEGORIES = [
  'ELEVATOR',
  'ESCALATOR',
  'STAIRS',
  'OTHER',
] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export const ASSET_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'DECOMMISSIONED',
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface Asset {
  id: string;
  tenantId: string;
  customerId: string;
  projectId: string | null;
  category: AssetCategory;
  name: string;
  buildingName: string | null;
  serialNumber: string | null;
  locationNotes: string | null;
  status: AssetStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetPayload {
  customerId: string;
  projectId?: string;
  category: AssetCategory;
  name: string;
  buildingName?: string;
  serialNumber?: string;
  locationNotes?: string;
  notes?: string;
}

export const listAssets = (options?: {
  q?: string;
  category?: AssetCategory;
  customerId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Asset>> => {
  const params = new URLSearchParams();
  if (options?.q) {
    params.set('q', options.q);
  }
  if (options?.category) {
    params.set('category', options.category);
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Asset>>(`/assets${query ? `?${query}` : ''}`);
};

export const createAsset = (payload: CreateAssetPayload): Promise<Asset> =>
  apiFetch<Asset>('/assets', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateAsset = (
  id: string,
  payload: {
    projectId?: string | null;
    category?: AssetCategory;
    name?: string;
    buildingName?: string | null;
    serialNumber?: string | null;
    locationNotes?: string | null;
    status?: AssetStatus;
    notes?: string | null;
  },
): Promise<Asset> =>
  apiFetch<Asset>(`/assets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const NOTIFICATION_TYPES = [
  'GENERAL',
  'QUOTE',
  'ASSIGNMENT',
  'MAINTENANCE',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

export const listNotifications = (options?: {
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<AppNotification>> => {
  const params = new URLSearchParams();
  if (options?.unreadOnly) {
    params.set('unreadOnly', 'true');
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<AppNotification>>(
    `/notifications${query ? `?${query}` : ''}`,
  );
};

export const createNotification = (payload: {
  userId: string;
  type?: NotificationType;
  title: string;
  body?: string;
  linkPath?: string;
}): Promise<AppNotification> =>
  apiFetch<AppNotification>('/notifications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const markNotificationRead = (
  id: string,
): Promise<AppNotification> =>
  apiFetch<AppNotification>(`/notifications/${id}/read`, {
    method: 'PATCH',
  });

export const markAllNotificationsRead = (): Promise<{ updated: number }> =>
  apiFetch<{ updated: number }>('/notifications/read-all', {
    method: 'POST',
  });

export const MAINTENANCE_RECURRENCES = [
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'BIANNUAL',
  'ANNUAL',
] as const;
export type MaintenanceRecurrence = (typeof MAINTENANCE_RECURRENCES)[number];

export const BREAKDOWN_SEVERITIES = [
  'EMERGENCY',
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
] as const;
export type BreakdownSeverity = (typeof BREAKDOWN_SEVERITIES)[number];

export const BREAKDOWN_STATUSES = ['OPEN', 'ASSIGNED', 'DONE'] as const;
export type BreakdownStatus = (typeof BREAKDOWN_STATUSES)[number];

export interface MaintenanceContract {
  id: string;
  assetId: string;
  customerId: string;
  recurrence: MaintenanceRecurrence;
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
  startDate: string;
  nextServiceAt: string;
  lastServiceAt: string | null;
  assignedUserId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Breakdown {
  id: string;
  assetId: string;
  customerId: string;
  title: string;
  description: string | null;
  severity: BreakdownSeverity;
  status: BreakdownStatus;
  assignedUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export const listMaintenanceContracts = (options?: {
  status?: string;
  customerId?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<MaintenanceContract>> => {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<MaintenanceContract>>(
    `/maintenance/contracts${query ? `?${query}` : ''}`,
  );
};

export const createMaintenanceContract = (payload: {
  assetId: string;
  recurrence?: MaintenanceRecurrence;
  startDate: string;
  nextServiceAt: string;
  assignedUserId?: string;
  notes?: string;
}): Promise<MaintenanceContract> =>
  apiFetch<MaintenanceContract>('/maintenance/contracts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateMaintenanceContract = (
  id: string,
  payload: {
    recurrence?: MaintenanceRecurrence;
    status?: MaintenanceContract['status'];
    nextServiceAt?: string;
    assignedUserId?: string | null;
    notes?: string | null;
  },
): Promise<MaintenanceContract> =>
  apiFetch<MaintenanceContract>(`/maintenance/contracts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/**
 * The three named fields are the client's own Maintenance Form; `notes`
 * stays the free-text catch-all beside them.
 */
export const logServiceVisit = (
  contractId: string,
  payload?: {
    notes?: string;
    inspectionResults?: string;
    partsReplaced?: string;
    recommendations?: string;
  },
): Promise<{ visit: { id: string }; contract: MaintenanceContract }> =>
  apiFetch(`/maintenance/contracts/${contractId}/visits`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });

/**
 * The printed Maintenance Report for one visit — the customer signs it on
 * paper. PDF only: the API 400s on any other format.
 */
export const downloadMaintenanceReport = (visitId: string): Promise<void> =>
  downloadDocument(
    `/maintenance/visits/${visitId}/report?format=pdf`,
    `maintenance-report-${visitId.slice(0, 8)}.pdf`,
  );

export const listBreakdowns = (options?: {
  status?: BreakdownStatus;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Breakdown>> => {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Breakdown>>(
    `/maintenance/breakdowns${query ? `?${query}` : ''}`,
  );
};

export const createBreakdown = (payload: {
  assetId: string;
  title: string;
  description?: string;
  severity?: BreakdownSeverity;
  assignedUserId?: string;
}): Promise<Breakdown> =>
  apiFetch<Breakdown>('/maintenance/breakdowns', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateBreakdown = (
  id: string,
  payload: {
    severity?: BreakdownSeverity;
    status?: BreakdownStatus;
    assignedUserId?: string | null;
    description?: string | null;
  },
): Promise<Breakdown> =>
  apiFetch<Breakdown>(`/maintenance/breakdowns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export type AppLocale = 'en' | 'am';

export interface TenantSettings {
  tenantId: string;
  /** Company name — the letterhead on every branded document. */
  name: string;
  /** Printed under the company name on every branded document. */
  slogan: string | null;
  primaryColorHex: string;
  secondaryColorHex: string;
  logoUrl: string | null;
  stampUrl: string | null;
  officialAddress: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultLocale: AppLocale;
  /** Days ahead of a maintenance contract's nextServiceAt the daily
   * reminder cron fires (I7 — was API-only, now editable here too). */
  maintenanceReminderDays: number;
  /** Days relative to an invoice's dueDate the payment-reminder cron fires
   * on — 0 is the due date itself, positive is days after (I7). */
  paymentReminderOffsetDays: number[];
  /** Last-run result of the daily maintenance-reminder cron's consent gate
   * (task-3 §3.4) — both null until that cron has ever run once. Read-only. */
  maintenanceReminderConsentSkippedLastRunAt: string | null;
  maintenanceReminderConsentSkippedCount: number | null;
  /** Same, for the daily payment-reminder cron. */
  paymentReminderConsentSkippedLastRunAt: string | null;
  paymentReminderConsentSkippedCount: number | null;
  /** Same run, the OTHER reason a reminder silently never arrives (I4) — a
   * stored phone number that fails validation. Read-only. */
  maintenanceReminderInvalidPhoneSkippedCount: number | null;
  paymentReminderInvalidPhoneSkippedCount: number | null;
  updatedAt: string;
}

export const getSettings = (): Promise<TenantSettings> =>
  apiFetch<TenantSettings>('/settings');

export type ProjectPipelineStatus =
  | 'LEAD'
  | 'SITE_SURVEY'
  | 'SPEC_CALCULATION'
  | 'QUOTATION'
  | 'PROFORMA'
  | 'CONTRACT'
  | 'EXECUTION';

export interface PipelineStage {
  status: ProjectPipelineStatus;
  count: number;
  valueEtb: string;
}

export interface UpcomingService {
  contractId: string;
  assetName: string;
  customerName: string;
  nextServiceAt: string;
  overdue: boolean;
}

export interface SalesFigures {
  pipeline: PipelineStage[];
  openPipelineValueEtb: string;
  wonThisMonth: { count: number; valueEtb: string };
}

export interface ServiceFigures {
  servicesDueThisWeek: number;
  servicesOverdue: number;
  openBreakdowns: number;
  emergencyBreakdowns: number;
  upcomingServices: UpcomingService[];
}

/**
 * The AR book on the aging report's definition of outstanding (per-invoice
 * balance, VOID excluded) — label it "Aged Outstanding", not "Net Balance":
 * a customer's net balance also carries unapplied cash and will differ.
 * Money fields are 2-decimal strings; render with `formatEtb`.
 */
export interface FinanceFigures {
  /** Payments received this calendar month, Addis time. Reversals net out. */
  revenueThisMonthEtb: string;
  outstandingTotalEtb: string;
  /** The part of `outstandingTotalEtb` already past its due date. */
  overdueTotalEtb: string;
  overdueInvoiceCount: number;
  /** Invoices with any balance left, overdue or not. */
  outstandingInvoiceCount: number;
  /**
   * The same ageing buckets the receivables report shows, summed from the
   * same balances expression — so the dashboard chart and the report can
   * never disagree. A null dueDate is `current`, never aged.
   */
  agingBuckets: {
    currentEtb: string;
    d1_30Etb: string;
    d31_60Etb: string;
    d61_90Etb: string;
    d90PlusEtb: string;
  };
  /**
   * Twelve months of collections, oldest first, zero-filled, `YYYY-MM` in
   * Addis local time. Always twelve entries so a chart never has to decide
   * whether a gap means "no data" or "no money".
   */
  collectionsByMonth: { month: string; totalEtb: string }[];
}

/** Sections absent from the response are ones this role may not see. */
export interface DashboardSummary {
  sales?: SalesFigures;
  service?: ServiceFigures;
  finance?: FinanceFigures;
  totals?: { customers: number; assets: number; employees: number };
}

export const getDashboardSummary = (): Promise<DashboardSummary> =>
  apiFetch<DashboardSummary>('/dashboard/summary');

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx';

/**
 * Fetch a binary document (PDF/Word/Excel). apiFetch can't be used here — it
 * assumes a JSON body. Shared by download and print so the 401-refresh dance
 * lives in one place.
 */
const fetchDocument = async (path: string, retryOn401 = true): Promise<Blob> => {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && retryOn401 && (await refreshTokens())) {
    return fetchDocument(path, false);
  }
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  return response.blob();
};

/**
 * Save a document to disk. The filename is reconstructed client-side from the
 * same `<prefix>-<number>.<ext>` scheme the server uses
 * (QuotationsController/ProformasController#document) rather than parsing
 * Content-Disposition — smaller, and the two are guaranteed to agree since
 * both come from the same source data.
 */
const downloadDocument = async (path: string, filename: string): Promise<void> => {
  const url = URL.createObjectURL(await fetchDocument(path));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Long enough for the print dialog to have taken the blob. */
const PRINT_CLEANUP_MS = 60_000;

/**
 * Print a document instead of saving it: the same PDF the download produces,
 * loaded into a hidden iframe and sent straight to the print dialog. Safari
 * refuses to print a PDF inside an iframe, so fall back to opening it in a
 * tab — and if the browser blocks that too, say so rather than doing nothing.
 *
 * ponytail: resolves when the dialog is handed the document, not when it
 * closes; the caller's busy state clears a moment early. Wire `afterprint`
 * through if that ever reads wrong.
 */
export const printDocument = async (path: string): Promise<void> => {
  const url = URL.createObjectURL(await fetchDocument(path));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  const cleanup = (): void => {
    frame.remove();
    URL.revokeObjectURL(url);
  };
  await new Promise<void>((resolve, reject) => {
    frame.onload = () => {
      const view = frame.contentWindow;
      try {
        if (!view) {
          throw new Error('no print view');
        }
        view.addEventListener('afterprint', cleanup);
        view.focus();
        view.print();
        // Not every browser fires afterprint; release the blob regardless.
        window.setTimeout(cleanup, PRINT_CLEANUP_MS);
        resolve();
        return;
      } catch {
        frame.remove();
      }
      // The iframe refused to print (Safari): show the PDF in a tab instead.
      window.setTimeout(() => URL.revokeObjectURL(url), PRINT_CLEANUP_MS);
      if (window.open(url, '_blank')) {
        resolve();
        return;
      }
      reject(
        new Error(
          'The browser blocked the print window. Allow pop-ups for this site, or use PDF to download it.',
        ),
      );
    };
    frame.onerror = () => {
      cleanup();
      reject(new Error('The document could not be opened for printing.'));
    };
    document.body.appendChild(frame);
    frame.src = url;
  });
};

export const printQuotationDocument = (id: string): Promise<void> =>
  printDocument(`/quotations/${id}/document?format=pdf`);

export const printProformaDocument = (id: string): Promise<void> =>
  printDocument(`/proformas/${id}/document?format=pdf`);

export const printInvoiceDocument = (id: string): Promise<void> =>
  printDocument(`/invoices/${id}/document?format=pdf`);

export const printReceiptDocument = (id: string): Promise<void> =>
  printDocument(`/payments/${id}/document?format=pdf`);

export const printContractDocument = (id: string): Promise<void> =>
  printDocument(`/contracts/${id}/document?format=pdf`);

/**
 * The date in the print header (globals.css `body::before` reads it). Stamped
 * here because CSS has no clock, and every page already imports this module.
 */
const stampPrintDate = (): void => {
  document.body.dataset.printDate = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

if (typeof document !== 'undefined') {
  window.addEventListener('beforeprint', stampPrintDate);
  if (document.body) {
    stampPrintDate();
  }
}

export type QuoteStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED_TO_PROFORMA';

export interface Quotation {
  id: string;
  projectId: string;
  customerId: string;
  quoteNumber: string;
  status: QuoteStatus;
  marginPercent: string;
  taxPercent: string;
  subtotalEtb: string;
  marginAmountEtb: string;
  taxAmountEtb: string;
  totalPriceEtb: string;

  // ---- negotiated price. Null on a quotation nobody has priced backward
  // from a round grand total (see priceQuotation).
  /** VAT-INCLUSIVE figure the frozen formula produced, on the same basis as
   *  totalPriceEtb — what the discount is measured against. */
  calculatedTotalEtb: string | null;
  /** calculatedTotalEtb - totalPriceEtb, also VAT-INCLUSIVE. Reading it as an
   *  ex-VAT amount under-reports every discount by the VAT rate. */
  discountAmountEtb: string | null;
  /** Same percent on either basis. Negative is a PREMIUM, not a discount. */
  discountPercent: string | null;
  /** Set only where the tenant's discount-approval threshold required a
   *  sign-off and someone gave it (see approveQuotationDiscount). */
  discountApprovedByUserId: string | null;

  // ---- commercial terms printed as prose on page 1 (see updateQuotationTerms).
  referenceCode: string | null;
  deliveryDays: number | null;
  warrantyPartsMonths: number | null;
  warrantyFreeServiceMonths: number | null;
  /** The validity the document STATES ("valid for 5 days"). `validUntil`
   *  below is the resolved date the system enforces; the two are kept apart
   *  so re-rendering an old document never re-states a fresh validity. */
  validityDays: number | null;

  validUntil: string | null;
  notes: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Same shape the calc engine takes, minus taxPercent — VAT is resolved
 *  server-side from the statutory rates table, never client-supplied. */
export interface CreateQuotationPayload extends Omit<CalcInputPayload, 'taxPercent'> {
  validUntil?: string;
  notes?: string;
}

export const listQuotations = (options?: {
  projectId?: string;
  status?: QuoteStatus;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Quotation>> => {
  const params = new URLSearchParams();
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Quotation>>(
    `/quotations${query ? `?${query}` : ''}`,
  );
};

export const createQuotationFromCalc = (
  projectId: string,
  payload: CreateQuotationPayload,
): Promise<Quotation> =>
  apiFetch<Quotation>(`/projects/${projectId}/quotations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const submitQuotation = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/submit`, { method: 'POST' });

export const approveQuotation = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/approve`, { method: 'POST' });

export const rejectQuotation = (
  id: string,
  reason: string,
): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const expireQuotation = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/expire`, { method: 'POST' });

export const downloadQuotationDocument = (
  id: string,
  quoteNumber: string,
  format: DocumentFormat,
): Promise<void> =>
  downloadDocument(
    `/quotations/${id}/document?format=${format}`,
    `quotation-${quoteNumber}.${format}`,
  );

/**
 * The standalone technical proposal / technical specification sheet — the
 * same EN 81 spec the quotation carries as a section, as its own document so
 * it can go to a consultant without the prices. PDF only: it has no docx or
 * spreadsheet renderer (the API 400s on any other format).
 */
export const downloadQuotationTechnicalProposal = (
  id: string,
  quoteNumber: string,
): Promise<void> =>
  downloadDocument(
    `/quotations/${id}/technical-proposal?format=pdf`,
    `technical-proposal-${quoteNumber}.pdf`,
  );

/** GET /quotations/:id — the bare header row, same shape the list returns. */
export const getQuotation = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}`);

/* ---- quotation line items ------------------------------------------ */

/**
 * Page 2's 19-row specification table. DISPLAY ONLY — none of these feed the
 * frozen pricing formula. `floorLabels` is the single exception, in one
 * direction: its COUNT fills the calculator's `stops`, which pricing already
 * used.
 */
export interface QuotationLineSpecFields {
  /** "WITH MR" / "MRL" as printed — the label, not the calculator's enum. */
  machineRoomLabel: string | null;
  /** Comma-separated floor names in print order: "B,G,M,1,2,...,10". */
  floorLabels: string | null;
  /** The compressed form they print: "B+G+M+10". */
  floorDisplaySummary: string | null;
  doorHeightMm: number | null;
  ropingRatio: string | null;
  tractionMachineType: string | null;
  /** "Simplex" / "Duplex" / "Triplex". */
  controlSystem: string | null;
  /** "380V AC 50HZ 3-phase 4 lines". */
  powerSupply: string | null;
  /** "240V AC 50HZ Single phase". */
  lightSupply: string | null;
  entranceCount: number | null;
}

/**
 * The same page-2 fields as they go OUT on a create/update body: every one
 * optional and never `null` — the API's validators reject null, so omit the
 * key instead of blanking it.
 */
export type QuotationLineSpecInput = {
  [K in keyof QuotationLineSpecFields]?: NonNullable<QuotationLineSpecFields[K]>;
};

/** One lift on page 1's line table (their "No of Units" column is `quantity`). */
export interface QuotationLine extends QuotationLineSpecFields {
  id: string;
  quotationId: string;
  /** 1-based print order. */
  sequence: number;
  productType: ProductType;
  /** Snapshots of this line's OWN calculator run. Null on a hand-entered
   *  line that no calculator run produced. */
  calcInput: Omit<CalcInputPayload, 'taxPercent'> | null;
  technicalSpec: CalcResult['technical'] | null;
  pricingBreakdown: CalcResult['pricing'] | null;
  /** The page-1 description cell, rendered verbatim. */
  specSummary: string | null;
  quantity: number;
  /** EX-VAT. After a round grand total is allocated across the lines,
   *  `lineTotalEtb` is NOT necessarily `quantity * unitPriceEtb` — the cent
   *  of rounding the customer absorbed lives in that gap. */
  unitPriceEtb: string | null;
  lineTotalEtb: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Priced by its own calculator run, so it takes the calculator's whole input
 * minus `taxPercent` (VAT is the statutory rate on the quotation header).
 * `stops` is optional only because `floorLabels` derives it — supply one or
 * the other or the API 400s.
 */
export interface CreateQuotationLinePayload
  extends Omit<CalcInputPayload, 'taxPercent' | 'stops'>,
    QuotationLineSpecInput {
  stops?: number;
  /** 1..999, defaults to 1. */
  quantity?: number;
  /** Derived from the spec fields when omitted. */
  specSummary?: string;
}

/**
 * Merged onto the line's stored spec and re-priced off the merged result, so
 * a one-field edit never has to restate the whole lift.
 */
export type UpdateQuotationLinePayload = Partial<CreateQuotationLinePayload>;

/**
 * Lines in print order. Never empty: a quotation written before line items
 * existed reads back as the single line its header implies, carrying the
 * QUOTATION's own id — which is also the id it keeps once a write
 * materializes it, so it is safe to edit and reorder like any other line.
 */
export const listQuotationLines = (id: string): Promise<QuotationLine[]> =>
  apiFetch<QuotationLine[]>(`/quotations/${id}/lines`);

/** DRAFT quotations only — the API 409s once it has left DRAFT. */
export const addQuotationLine = (
  id: string,
  payload: CreateQuotationLinePayload,
): Promise<QuotationLine> =>
  apiFetch<QuotationLine>(`/quotations/${id}/lines`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateQuotationLine = (
  id: string,
  lineId: string,
  payload: UpdateQuotationLinePayload,
): Promise<QuotationLine> =>
  apiFetch<QuotationLine>(`/quotations/${id}/lines/${lineId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** Returns the REMAINING lines, already renumbered — render them, don't
 *  re-fetch. */
export const removeQuotationLine = (
  id: string,
  lineId: string,
): Promise<QuotationLine[]> =>
  apiFetch<QuotationLine[]>(`/quotations/${id}/lines/${lineId}`, {
    method: 'DELETE',
  });

/**
 * `lineIds` must name EVERY line of the quotation exactly once, in the order
 * they should print — a partial list is rejected, because the print order is
 * a unique key and renumbering a subset collides with the rows left out.
 */
export const reorderQuotationLines = (
  id: string,
  lineIds: string[],
): Promise<QuotationLine[]> =>
  apiFetch<QuotationLine[]>(`/quotations/${id}/lines/reorder`, {
    method: 'POST',
    body: JSON.stringify({ lineIds }),
  });

/* ---- negotiated price ----------------------------------------------- */

/**
 * Price the quotation BACKWARD from the round, VAT-INCLUSIVE figure the
 * customer actually pays — how this client sells: their proforma reads
 * 7,835,000.00 where the formula gives 8,521,500.00, and 7,835,000 / 1.15 =
 * 6,813,043.48 + VAT 1,021,956.52 balances to the cent.
 *
 * The returned quotation carries the derived `subtotalEtb` / `taxAmountEtb` /
 * `totalPriceEtb` plus `calculatedTotalEtb`, `discountAmountEtb` and
 * `discountPercent`; each line's amount is re-allocated pro rata. Send a
 * decimal STRING (never a float) — `marginAmountEtb` comes back '0.00' on
 * purpose, since the negotiated subtotal already contains the margin.
 *
 * DRAFT only.
 */
export const priceQuotation = (
  id: string,
  grandTotalEtb: string,
): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/price`, {
    method: 'POST',
    body: JSON.stringify({ grandTotalEtb }),
  });

/**
 * Sign the negotiated discount off as yourself (CEO/FINANCE). Only needed
 * where the tenant set a discount-approval threshold and this quotation is
 * over it — submitting an unapproved over-threshold quotation is what fails.
 * 400s on a quotation that has no negotiated discount yet.
 */
export const approveQuotationDiscount = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/quotations/${id}/approve-discount`, { method: 'POST' });

/* ---- commercial terms + payment schedule ---------------------------- */

/** One row of the schedule the OFFER states — a percentage against an event,
 *  not a dated instalment. */
export interface QuotationPaymentTerm {
  id: string;
  quotationId: string;
  /** 1-based print order. */
  sequence: number;
  /** The sentence printed: "Payable upon submission of shipping documents". */
  label: string;
  /** Percent of the quoted price, as a decimal string. */
  percent: string;
  /** Optional machine tag (SIGNING, SHIPPING_DOCUMENTS, ...). Nothing keys
   *  off it yet. */
  triggerEvent: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row as the schedule editor sends it — `sequence` is the array order. */
export interface PaymentTermInput {
  label: string;
  percent: string;
  triggerEvent?: string;
}

/**
 * Only the keys PRESENT are written: sending `{ deliveryDays: 120 }` must not
 * blank the warranty someone else set, so omit a field rather than sending
 * null or ''.
 */
export interface UpdateQuotationTermsPayload {
  /** Their own offer reference, e.g. "Rodas FUJIHD-E02". */
  referenceCode?: string;
  deliveryDays?: number;
  warrantyPartsMonths?: number;
  warrantyFreeServiceMonths?: number;
  validityDays?: number;
  /**
   * Replaces the WHOLE schedule when present; `[]` clears it. The percentages
   * must total exactly 100 or the API 400s. Omit the key to leave the
   * existing schedule alone.
   */
  paymentTerms?: PaymentTermInput[];
}

export const listQuotationPaymentTerms = (
  id: string,
): Promise<QuotationPaymentTerm[]> =>
  apiFetch<QuotationPaymentTerm[]>(`/quotations/${id}/payment-terms`);

/** DRAFT only. Returns the updated header AND the schedule as saved, so a
 *  terms form needs no follow-up fetch. */
export const updateQuotationTerms = (
  id: string,
  payload: UpdateQuotationTermsPayload,
): Promise<{ quotation: Quotation; paymentTerms: QuotationPaymentTerm[] }> =>
  apiFetch<{ quotation: Quotation; paymentTerms: QuotationPaymentTerm[] }>(
    `/quotations/${id}/terms`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );

export type ProformaStatus = 'ISSUED' | 'CANCELLED';

export interface Proforma {
  id: string;
  quotationId: string;
  projectId: string;
  customerId: string;
  proformaNumber: string;
  fiscalYearLabel: string;
  subtotalEtb: string;
  vatEtb: string;
  totalEtb: string;
  issuedAt: string;
  issuedByUserId: string | null;
  validUntil: string | null;
  status: ProformaStatus;
  cancelReason: string | null;
  createdAt: string;
}

export const listProformas = (options?: {
  projectId?: string;
  status?: ProformaStatus;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Proforma>> => {
  const params = new URLSearchParams();
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<Proforma>>(
    `/proformas${query ? `?${query}` : ''}`,
  );
};

export const convertQuotationToProforma = (
  quotationId: string,
  validUntil?: string,
): Promise<Proforma> =>
  apiFetch<Proforma>(`/quotations/${quotationId}/convert-to-proforma`, {
    method: 'POST',
    body: JSON.stringify(validUntil ? { validUntil } : {}),
  });

export const cancelProforma = (
  id: string,
  reason: string,
): Promise<Proforma> =>
  apiFetch<Proforma>(`/proformas/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const downloadProformaDocument = (
  id: string,
  proformaNumber: string,
  format: DocumentFormat,
): Promise<void> =>
  downloadDocument(
    `/proformas/${id}/document?format=${format}`,
    `proforma-${proformaNumber}.${format}`,
  );

export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';

export interface Invoice {
  id: string;
  invoiceNumber: string;
  fiscalYearLabel: string;
  proformaId: string | null;
  customerId: string;
  projectId: string | null;
  subtotalEtb: string;
  vatEtb: string;
  whtEtb: string;
  whtVoucherRef: string | null;
  whtRecordedAt: string | null;
  totalEtb: string;
  status: InvoiceStatus;
  voidReason: string | null;
  issuedAt: string;
  dueDate: string | null;
  fiscalReceiptNumber: string | null;
  fiscalDeviceSerial: string | null;
  fiscalIssuedAt: string | null;
  fiscalKind: string | null;
  fiscalNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLine {
  id: string;
  invoiceId: string;
  lineNo: number;
  description: string;
  quantity: string;
  unitPriceEtb: string;
  lineTotalEtb: string;
}

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

/**
 * GET /invoices list rows only — `allocatedEtb`/`outstandingEtb` are
 * aggregates the server computes for the page (see
 * InvoicesRepository.withOutstanding), never present on the create/void/
 * fiscal/withholding endpoints' responses, which is why they live on this
 * type instead of the base `Invoice`.
 */
export interface InvoiceListRow extends Invoice {
  /** Σ payment_allocations against this invoice. */
  allocatedEtb: string;
  /** totalEtb − whtEtb − allocatedEtb (forced to '0.00' for VOID) — exact and server-computed; never re-derive this client-side. */
  outstandingEtb: string;
}

/** POST /proformas/:id/convert-to-invoice — lives on InvoicesController
 *  (@Roles('FINANCE')), not ProformasController, despite the URL prefix. */
export const convertProformaToInvoice = (
  proformaId: string,
  dueDate?: string,
): Promise<InvoiceWithLines> =>
  apiFetch<InvoiceWithLines>(`/proformas/${proformaId}/convert-to-invoice`, {
    method: 'POST',
    body: JSON.stringify(dueDate ? { dueDate } : {}),
  });

export const listInvoices = (options?: {
  status?: InvoiceStatus;
  customerId?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<InvoiceListRow>> => {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.q) {
    params.set('q', options.q);
  }
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<InvoiceListRow>>(`/invoices${query ? `?${query}` : ''}`);
};

export interface CreateInvoiceLinePayload {
  description: string;
  quantity: string;
  unitPriceEtb: string;
}

export interface CreateInvoicePayload {
  customerId: string;
  projectId?: string;
  lines: CreateInvoiceLinePayload[];
  dueDate?: string;
}

export const createInvoice = (
  payload: CreateInvoicePayload,
): Promise<InvoiceWithLines> =>
  apiFetch<InvoiceWithLines>('/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const voidInvoice = (id: string, reason: string): Promise<Invoice> =>
  apiFetch<Invoice>(`/invoices/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const recordInvoiceWithholding = (
  id: string,
  payload: { amountEtb: string; voucherRef?: string },
): Promise<Invoice> =>
  apiFetch<Invoice>(`/invoices/${id}/withholding`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const downloadInvoiceDocument = (
  id: string,
  invoiceNumber: string,
  format: DocumentFormat,
): Promise<void> =>
  downloadDocument(
    `/invoices/${id}/document?format=${format}`,
    `invoice-${invoiceNumber}.${format}`,
  );

export type PaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'CBE_BIRR'
  | 'TELEBIRR'
  | 'OTHER';

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amountEtb: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  receiptNumber: string;
  fiscalYearLabel: string;
  customerId: string;
  receivedAt: string;
  amountEtb: string;
  method: PaymentMethod;
  bankAccountId: string | null;
  reference: string | null;
  note: string | null;
  reversalOfPaymentId: string | null;
  reverseReason: string | null;
  createdAt: string;
}

export interface PaymentWithAllocations extends Payment {
  allocations: PaymentAllocation[];
}

export interface RecordPaymentPayload {
  customerId: string;
  amountEtb: string;
  method: PaymentMethod;
  receivedAt?: string;
  bankAccountId?: string;
  reference?: string;
  note?: string;
  allocations?: { invoiceId: string; amountEtb: string }[];
}

export const recordPayment = (
  payload: RecordPaymentPayload,
): Promise<PaymentWithAllocations> =>
  apiFetch<PaymentWithAllocations>('/payments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const allocatePayment = (
  paymentId: string,
  payload: { invoiceId: string; amountEtb: string },
): Promise<PaymentAllocation> =>
  apiFetch<PaymentAllocation>(`/payments/${paymentId}/allocations`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const reversePayment = (
  paymentId: string,
  reason: string,
): Promise<PaymentWithAllocations> =>
  apiFetch<PaymentWithAllocations>(`/payments/${paymentId}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

/** No xlsx — PaymentsController#document rejects it (a receipt isn't a table). */
export const downloadReceiptDocument = (
  id: string,
  receiptNumber: string,
  format: 'pdf' | 'docx',
): Promise<void> =>
  downloadDocument(
    `/payments/${id}/document?format=${format}`,
    `receipt-${receiptNumber}.${format}`,
  );

/**
 * GET /payments list row: the payment + its customer's display name +
 * Σ payment_allocations (`allocatedEtb`, one aggregate the server computes
 * for the page — never per-row). No `allocations` array here — that detail
 * only comes back from the POST/PATCH endpoints' `PaymentWithAllocations`.
 */
export interface PaymentListRow extends Payment {
  customerName: string | null;
  allocatedEtb: string;
}

const paymentListParams = (options?: {
  customerId?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  q?: string;
}): URLSearchParams => {
  const params = new URLSearchParams();
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.method) {
    params.set('method', options.method);
  }
  if (options?.from) {
    params.set('from', options.from);
  }
  if (options?.to) {
    params.set('to', options.to);
  }
  if (options?.q) {
    params.set('q', options.q);
  }
  return params;
};

export const listPayments = (options?: {
  customerId?: string;
  method?: PaymentMethod;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<PaymentListRow>> => {
  const params = paymentListParams(options);
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<PaymentListRow>>(`/payments${query ? `?${query}` : ''}`);
};

export type PaymentExportFormat = 'csv' | 'xlsx';

/** GET /payments?format=csv|xlsx with the same filters as listPayments — same blob-download helper as downloadAgingReport/downloadCustomerStatement. */
export const downloadPayments = (
  format: PaymentExportFormat,
  options?: { customerId?: string; method?: PaymentMethod; from?: string; to?: string; q?: string },
): Promise<void> => {
  const params = paymentListParams(options);
  params.set('format', format);
  return downloadDocument(`/payments?${params.toString()}`, `payments.${format}`);
};

export interface BankAccount {
  id: string;
  name: string;
  bankName: string;
  accountNumber: string;
  isActive: boolean;
  balanceEtb: string;
}

export const listBankAccounts = (options?: {
  page?: number;
  pageSize?: number;
}): Promise<Paginated<BankAccount>> => {
  const params = new URLSearchParams();
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<BankAccount>>(
    `/bank-accounts${query ? `?${query}` : ''}`,
  );
};

export interface AgingRow {
  customerId: string;
  customerName: string | null;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  d90_plus: string;
  /** Per-invoice aged total — deliberately excludes unapplied cash; see
   *  Customer.outstandingBalanceEtb's own doc comment for why the two
   *  legitimately disagree. */
  total: string;
}

/** GET /invoices/aging — a bounded aggregate report (one row per customer
 *  with an outstanding balance), not a list endpoint: the API returns a
 *  flat array with no page/pageSize params to page through, so this has no
 *  client-side pagination either. */
export const getAgingReport = (): Promise<AgingRow[]> =>
  apiFetch<AgingRow[]>('/invoices/aging');

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export const downloadAgingReport = (format: ReportFormat): Promise<void> =>
  downloadDocument(`/invoices/aging?format=${format}`, `aging-report.${format}`);

export type StatementRowKind = 'invoice' | 'payment' | 'withholding';

export interface StatementRow {
  id: string;
  kind: StatementRowKind;
  date: string;
  reference: string;
  debit: string;
  credit: string;
  balance: string;
}

export interface CustomerStatement {
  customerId: string;
  customerName: string;
  openingBalance: string;
  closingBalance: string;
  rows: StatementRow[];
}

/** GET /customers/:id/statement — narrowed to @Roles('FINANCE') at the
 *  route level, overriding CustomersController's wider class-level roles.
 *  customerId is encoded into the path and from/to go through
 *  URLSearchParams (not raw template interpolation) — both values only ever
 *  come from a <select>/<input type="date"> today, but this keeps the same
 *  safe-by-construction shape as listInvoices/listBankAccounts rather than
 *  relying on that staying true. */
export const getCustomerStatement = (
  customerId: string,
  from: string,
  to: string,
): Promise<CustomerStatement> =>
  apiFetch<CustomerStatement>(
    `/customers/${encodeURIComponent(customerId)}/statement?${new URLSearchParams({ from, to })}`,
  );

export const downloadCustomerStatement = (
  customerId: string,
  from: string,
  to: string,
  format: ReportFormat,
): Promise<void> =>
  downloadDocument(
    `/customers/${encodeURIComponent(customerId)}/statement?${new URLSearchParams({ from, to, format })}`,
    `statement-${customerId}-${from}-to-${to}.${format}`,
  );

export const updateSettings = (payload: {
  name?: string;
  slogan?: string | null;
  primaryColorHex?: string;
  secondaryColorHex?: string;
  logoUrl?: string | null;
  stampUrl?: string | null;
  officialAddress?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  defaultLocale?: AppLocale;
  maintenanceReminderDays?: number;
  paymentReminderOffsetDays?: number[];
}): Promise<TenantSettings> =>
  apiFetch<TenantSettings>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export type MessageChannel = 'SMS' | 'EMAIL';
export type MessageStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';

/** GET /outbox row — the message log (task-3 §3.3), role-gated to ADMIN/CEO. */
export interface OutboundMessage {
  id: string;
  channel: MessageChannel;
  recipient: string;
  body: string;
  status: MessageStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  dedupeKey: string;
  providerMessageId: string | null;
  providerName: string | null;
  sentAt: string | null;
  createdByUserId: string | null;
  subjectKind: string | null;
  subjectId: string | null;
  createdAt: string;
  updatedAt: string;
  /** SMS segment count/encoding cost, computed on read (I5) — how many
   * segments this body needs, so a template tripling the bill is visible
   * before the bill arrives. */
  segments: number;
}

const outboxListParams = (options?: {
  status?: MessageStatus;
  channel?: MessageChannel;
  from?: string;
  to?: string;
}): URLSearchParams => {
  const params = new URLSearchParams();
  if (options?.status) {
    params.set('status', options.status);
  }
  if (options?.channel) {
    params.set('channel', options.channel);
  }
  if (options?.from) {
    params.set('from', options.from);
  }
  if (options?.to) {
    params.set('to', options.to);
  }
  return params;
};

export const listOutbox = (options?: {
  status?: MessageStatus;
  channel?: MessageChannel;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<OutboundMessage>> => {
  const params = outboxListParams(options);
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<OutboundMessage>>(`/outbox${query ? `?${query}` : ''}`);
};

export type OutboxExportFormat = 'csv' | 'xlsx';

/** GET /outbox?format=csv|xlsx with the same filters as listOutbox — same blob-download helper as downloadPayments. */
export const downloadOutbox = (
  format: OutboxExportFormat,
  options?: { status?: MessageStatus; channel?: MessageChannel; from?: string; to?: string },
): Promise<void> => {
  const params = outboxListParams(options);
  params.set('format', format);
  return downloadDocument(`/outbox?${params.toString()}`, `outbox.${format}`);
};

/** Which SmsProvider is actually wired up — 'noop' means nothing on this page really sent (task-3 §3.3). */
export const getOutboxProvider = (): Promise<{ provider: string }> =>
  apiFetch<{ provider: string }>('/outbox/provider');

/** Retry a FAILED message: QUEUED, due immediately, attempts NOT reset. */
export const retryOutboxMessage = (id: string): Promise<OutboundMessage> =>
  apiFetch<OutboundMessage>(`/outbox/${id}/retry`, { method: 'POST' });

/* ---- contracts ------------------------------------------------------ */

export type ContractStatus = 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'CANCELLED';

export interface Contract {
  id: string;
  proformaId: string;
  projectId: string;
  customerId: string;
  contractNumber: string;
  fiscalYearLabel: string;
  contractValueEtb: string;
  scopeOfWork: string | null;
  termsAndConditions: string | null;
  warrantyMonths: number | null;
  status: ContractStatus;
  signedAt: string | null;
  handedOverAt: string | null;
  handedOverToName: string | null;
  handoverNotes: string | null;
  cancelReason: string | null;
  issuedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The list joins the names on; GET /contracts/:id returns the bare record. */
export interface ContractListRow extends Contract {
  customerName: string | null;
  projectName: string | null;
}

/** Shared by the list and its export so the two can never disagree on the
 *  filters — same shape as paymentListParams/outboxListParams. */
const contractListParams = (options?: {
  projectId?: string;
  customerId?: string;
  status?: ContractStatus;
}): URLSearchParams => {
  const params = new URLSearchParams();
  if (options?.projectId) {
    params.set('projectId', options.projectId);
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId);
  }
  if (options?.status) {
    params.set('status', options.status);
  }
  return params;
};

export const listContracts = (options?: {
  projectId?: string;
  customerId?: string;
  status?: ContractStatus;
  page?: number;
  pageSize?: number;
}): Promise<Paginated<ContractListRow>> => {
  const params = contractListParams(options);
  if (options?.page) {
    params.set('page', String(options.page));
  }
  if (options?.pageSize) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return apiFetch<Paginated<ContractListRow>>(`/contracts${query ? `?${query}` : ''}`);
};

export type ContractExportFormat = 'csv' | 'xlsx';

/** GET /contracts?format=csv|xlsx with the same filters as listContracts —
 *  the whole filtered set, not just the loaded page. */
export const downloadContracts = (
  format: ContractExportFormat,
  options?: { projectId?: string; customerId?: string; status?: ContractStatus },
): Promise<void> => {
  const params = contractListParams(options);
  params.set('format', format);
  return downloadDocument(`/contracts?${params.toString()}`, `contracts.${format}`);
};

export const getContract = (id: string): Promise<Contract> =>
  apiFetch<Contract>(`/contracts/${id}`);

/** DRAFT contracts only — the API 409s once the customer has signed. */
export const updateContract = (
  id: string,
  payload: {
    scopeOfWork?: string | null;
    termsAndConditions?: string | null;
    warrantyMonths?: number | null;
  },
): Promise<Contract> =>
  apiFetch<Contract>(`/contracts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** DRAFT -> SIGNED. `signedAt` is an ISO date; the API defaults it to today. */
export const signContract = (id: string, signedAt?: string): Promise<Contract> =>
  apiFetch<Contract>(`/contracts/${id}/sign`, {
    method: 'POST',
    body: JSON.stringify(signedAt ? { signedAt } : {}),
  });

/** A contract is never deleted — cancelling with a reason is the way out. */
export const cancelContract = (id: string, reason: string): Promise<Contract> =>
  apiFetch<Contract>(`/contracts/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const downloadContractDocument = (
  id: string,
  contractNumber: string,
  format: DocumentFormat,
): Promise<void> =>
  downloadDocument(
    `/contracts/${id}/document?format=${format}`,
    `contract-${contractNumber}.${format}`,
  );

/** Issue a DRAFT contract from an ISSUED proforma. 409 on a cancelled
 *  proforma or one that already has a contract. */
export const issueContractFromProforma = (
  proformaId: string,
): Promise<Contract> =>
  apiFetch<Contract>(`/proformas/${proformaId}/contract`, { method: 'POST' });

/* ---- contract payment schedule ------------------------------------- */

export type ContractInstalmentStatus = 'PENDING' | 'INVOICED' | 'CANCELLED';

export interface ContractInstalment {
  id: string;
  contractId: string;
  sequence: number;
  label: string;
  dueDate: string | null;
  amountEtb: string;
  status: ContractInstalmentStatus;
  invoiceId: string | null;
}

/** One row as the schedule editor sends it — `sequence` is the array order. */
export interface ContractInstalmentInput {
  label: string;
  dueDate?: string;
  amountEtb: string;
}

export const listContractInstalments = (
  contractId: string,
): Promise<ContractInstalment[]> =>
  apiFetch<ContractInstalment[]>(`/contracts/${contractId}/instalments`);

/**
 * Replace the WHOLE schedule. There is no add-one endpoint: the instalments
 * are numbered in agreed order and have to total the contract value as a
 * set, so the list is the unit of change. DRAFT contracts only — the API
 * rejects an edit once the customer has signed the schedule.
 */
export const setContractInstalments = (
  contractId: string,
  instalments: ContractInstalmentInput[],
): Promise<ContractInstalment[]> =>
  apiFetch<ContractInstalment[]>(`/contracts/${contractId}/instalments`, {
    method: 'PUT',
    body: JSON.stringify({ instalments }),
  });

/** Record the invoice actually raised for one instalment: PENDING -> INVOICED. */
export const markContractInstalmentInvoiced = (
  contractId: string,
  instalmentId: string,
  invoiceId: string,
): Promise<ContractInstalment> =>
  apiFetch<ContractInstalment>(
    `/contracts/${contractId}/instalments/${instalmentId}/invoice`,
    { method: 'POST', body: JSON.stringify({ invoiceId }) },
  );

/** The printed Payment Schedule for wet signing. PDF only. */
export const downloadPaymentSchedule = (
  contractId: string,
  contractNumber: string,
): Promise<void> =>
  downloadDocument(
    `/contracts/${contractId}/payment-schedule`,
    `payment-schedule-${contractNumber}.pdf`,
  );

/**
 * Record the handover of a SIGNED contract. The API moves the contract
 * SIGNED -> COMPLETED and advances the project to COMPLETED in the same
 * transaction, so a 409 here means the contract was not SIGNED (already
 * handed over, still a draft, or cancelled).
 */
export const handoverContract = (
  contractId: string,
  payload: {
    handedOverAt?: string;
    handedOverToName: string;
    handoverNotes?: string;
  },
): Promise<{ id: string; contractNumber: string; status: string }> =>
  apiFetch(`/contracts/${contractId}/handover`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** The Completion Certificate for wet signing. PDF only; 409 until a handover is recorded. */
export const downloadCompletionCertificate = (
  contractId: string,
  contractNumber: string,
): Promise<void> =>
  downloadDocument(
    `/contracts/${contractId}/completion-certificate`,
    `completion-certificate-${contractNumber}.pdf`,
  );

/** The Warranty Certificate. PDF only; 409 when the contract carries no warranty period. */
export const downloadWarrantyCertificate = (
  contractId: string,
  contractNumber: string,
): Promise<void> =>
  downloadDocument(
    `/contracts/${contractId}/warranty-certificate`,
    `warranty-certificate-${contractNumber}.pdf`,
  );

/* ---- document boilerplate + component specifications ---------------- */

/**
 * One prose slot of pages 3-6 (scope of supply, exclusions, standards...),
 * owned by the tenant and edited once instead of pasted per quote — which is
 * what let the client's own copies drift out of sync with their spec table.
 *
 * `body` is PLAIN TEXT, not Markdown or HTML: a line beginning with '- ' is
 * rendered as a bullet, every other line as a paragraph line.
 */
export interface BoilerplateSection {
  id: string;
  /** The layout slot the renderer looks this up by — an identifier
   *  (`^[a-z][a-z0-9_]*$`), not free text. Immutable after create: renaming
   *  it would silently empty that slot. */
  sectionKey: string;
  title: string | null;
  body: string | null;
  sortOrder: number;
  /** False hides the section from printed documents without losing its text. */
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * The COMPLETE list in one envelope — the API never really pages this (8-ish
 * rows, and reordering a list you can only see part of is a bug generator),
 * so `page` is always 1 and `pageSize` is the row count. Render the rows;
 * do not build a pager. Inactive sections are included.
 */
export const listBoilerplateSections = (): Promise<
  Paginated<BoilerplateSection>
> => apiFetch<Paginated<BoilerplateSection>>('/settings/boilerplate');

/** `sortOrder` omitted appends to the end. 409s on a duplicate `sectionKey`. */
export const createBoilerplateSection = (payload: {
  sectionKey: string;
  title?: string;
  body?: string;
  sortOrder?: number;
}): Promise<BoilerplateSection> =>
  apiFetch<BoilerplateSection>('/settings/boilerplate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** No `sectionKey` and no `isActive` here on purpose — the key is the slot
 *  identity, and deactivation has its own route below. */
export const updateBoilerplateSection = (
  id: string,
  payload: { title?: string; body?: string; sortOrder?: number },
): Promise<BoilerplateSection> =>
  apiFetch<BoilerplateSection>(`/settings/boilerplate/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** Stop printing a section without losing its text. There is no reactivate
 *  route yet; there is no delete route at all. */
export const deactivateBoilerplateSection = (
  id: string,
): Promise<BoilerplateSection> =>
  apiFetch<BoilerplateSection>(`/settings/boilerplate/${id}/deactivate`, {
    method: 'POST',
  });

/** `ids` must name EVERY section exactly once, in the new print order — a
 *  partial list is rejected as a client that reordered a stale list. */
export const reorderBoilerplateSections = (
  ids: string[],
): Promise<Paginated<BoilerplateSection>> =>
  apiFetch<Paginated<BoilerplateSection>>('/settings/boilerplate/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });

/** One row of the component/brand table on their page 5 ("Traction machine
 *  — FUJI — Zhejiang (Sino-Japan Joint Venture)"). Tenant-level: the same
 *  table on every document until they change supplier. */
export interface ComponentSpecification {
  id: string;
  /** 1-based row number in the printed table, unique per tenant. */
  sequence: number;
  componentName: string;
  brand: string | null;
  remark: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Same whole-list envelope as listBoilerplateSections — page 1, pageSize =
 *  row count, no pager. */
export const listComponentSpecifications = (): Promise<
  Paginated<ComponentSpecification>
> => apiFetch<Paginated<ComponentSpecification>>('/settings/components');

/** `sequence` omitted appends to the end; giving one that is taken 409s. */
export const createComponentSpecification = (payload: {
  componentName: string;
  brand?: string;
  remark?: string;
  sequence?: number;
}): Promise<ComponentSpecification> =>
  apiFetch<ComponentSpecification>('/settings/components', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** No `sequence` — reordering is the reorder route, so the unique row number
 *  can never collide through an edit. */
export const updateComponentSpecification = (
  id: string,
  payload: { componentName?: string; brand?: string; remark?: string },
): Promise<ComponentSpecification> =>
  apiFetch<ComponentSpecification>(`/settings/components/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** A hard delete, unlike a boilerplate section — documents already issued
 *  carry their own snapshot. 204, so nothing comes back. */
export const deleteComponentSpecification = (id: string): Promise<void> =>
  apiFetch<void>(`/settings/components/${id}`, { method: 'DELETE' });

/** `ids` must name EVERY row exactly once, in the new print order. */
export const reorderComponentSpecifications = (
  ids: string[],
): Promise<Paginated<ComponentSpecification>> =>
  apiFetch<Paginated<ComponentSpecification>>('/settings/components/reorder', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
