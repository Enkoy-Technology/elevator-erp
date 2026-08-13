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

export interface CalcInputPayload {
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
  technical: {
    capacityPersons: number;
    carWidthMm: number;
    carDepthMm: number;
    carHeightMm: number;
    shaftWidthMm: number;
    shaftDepthMm: number;
    pitDepthMm: number;
    overheadClearanceMm: number;
    counterweightMassKg: string;
    motorPowerKw: string;
    guideRailSpec: string;
    machineRoomWidthMm: number | null;
    machineRoomDepthMm: number | null;
    machineRoomHeightMm: number | null;
  };
  pricing: {
    qBase: string;
    baseCost: string;
    stopCost: string;
    capacityMultiplier: string;
    speedPremium: string;
    doorPremium: string;
    installationCost: string;
    freightCost: string;
    equipmentSubtotal: string;
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
  city: string | null;
  country: string;
  customerType: CustomerType;
  creditLimitEtb: string;
  /** Net account position (invoices owed minus unapplied cash) — not the same as the aging report's per-invoice total; the two legitimately disagree by unapplied cash. */
  outstandingBalanceEtb: string;
  /** ECA Directive 832/2021 recorded consent to receive SMS — null until given. Server-stamped only (see CreateCustomerPayload.smsConsentGiven's own doc comment); never set this directly. */
  smsConsentAt: string | null;
  createdAt: string;
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
  page?: number;
  pageSize?: number;
}): Promise<Paginated<Project>> => {
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
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateEmployeePayload {
  email: string;
  fullName: string;
  phone?: string;
  role: EmployeeRole;
  password: string;
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
  page?: number;
  pageSize?: number;
}): Promise<Paginated<MaintenanceContract>> => {
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

export const logServiceVisit = (
  contractId: string,
  payload?: { notes?: string },
): Promise<{ visit: unknown; contract: MaintenanceContract }> =>
  apiFetch(`/maintenance/contracts/${contractId}/visits`, {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });

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
  primaryColorHex: string;
  secondaryColorHex: string;
  logoUrl: string | null;
  stampUrl: string | null;
  officialAddress: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  defaultLocale: AppLocale;
  /** Last-run result of the daily maintenance-reminder cron's consent gate
   * (task-3 §3.4) — both null until that cron has ever run once. Read-only. */
  maintenanceReminderConsentSkippedLastRunAt: string | null;
  maintenanceReminderConsentSkippedCount: number | null;
  /** Same, for the daily payment-reminder cron. */
  paymentReminderConsentSkippedLastRunAt: string | null;
  paymentReminderConsentSkippedCount: number | null;
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

/** Sections absent from the response are ones this role may not see. */
export interface DashboardSummary {
  sales?: SalesFigures;
  service?: ServiceFigures;
  totals?: { customers: number; assets: number; employees: number };
}

export const getDashboardSummary = (): Promise<DashboardSummary> =>
  apiFetch<DashboardSummary>('/dashboard/summary');

export type DocumentFormat = 'pdf' | 'docx' | 'xlsx';

/**
 * Fetch a binary document (PDF/Word/Excel) and trigger a browser download.
 * apiFetch can't be used here — it assumes a JSON body. The filename is
 * reconstructed client-side from the same `<prefix>-<number>.<ext>` scheme
 * the server uses (QuotationsController/ProformasController#document),
 * rather than parsing Content-Disposition — smaller, and the two are
 * guaranteed to agree since both come from the same source data.
 */
const downloadDocument = async (
  path: string,
  filename: string,
  retryOn401 = true,
): Promise<void> => {
  const token = getAccessToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401 && retryOn401 && (await refreshTokens())) {
    return downloadDocument(path, filename, false);
  }
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

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
  validUntil: string | null;
  notes: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
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
  primaryColorHex?: string;
  secondaryColorHex?: string;
  logoUrl?: string | null;
  stampUrl?: string | null;
  officialAddress?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  defaultLocale?: AppLocale;
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
