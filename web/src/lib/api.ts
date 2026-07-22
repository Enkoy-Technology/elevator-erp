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

export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail || problem.title);
    this.name = 'ApiError';
  }
}

export const getAccessToken = (): string | null =>
  typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);

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

const refreshTokens = async (): Promise<boolean> => {
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

export const listCustomers = (search?: string): Promise<Customer[]> => {
  const query = search?.trim()
    ? `?q=${encodeURIComponent(search.trim())}`
    : '';
  return apiFetch<Customer[]>(`/customers${query}`);
};

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

export const listProjects = (status?: ProjectStatus): Promise<Project[]> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiFetch<Project[]>(`/projects${query}`);
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
): Promise<Project> =>
  apiFetch<Project>(`/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
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
