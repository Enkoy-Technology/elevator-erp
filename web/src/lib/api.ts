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
