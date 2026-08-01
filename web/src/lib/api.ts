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

export const getHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
};

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
  outstandingBalanceEtb: string;
  createdAt: string;
}

export interface CreateCustomerPayload {
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  customerType?: CustomerType;
  notes?: string;
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

export const getUnreadNotificationCount = (): Promise<{ count: number }> =>
  apiFetch<{ count: number }>('/notifications/unread-count');

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
