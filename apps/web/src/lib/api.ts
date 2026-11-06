import {
  healthResponseSchema,
  HEALTH_PATH,
  type AuthSessionResponse,
  type ChangePinInput,
  type CreateUserInput,
  type HealthResponse,
  type LoginInput,
  type OrganizationDto,
  type PaginatedResponse,
  type RoleWithPermissionsDto,
  type SetupInitializeInput,
  type SetupStatusResponse,
  type UpdateOrganizationInput,
  type UpdateRolePermissionsInput,
  type UpdateUserInput,
  type UserDto,
  type UserListQuery,
  type VerifyPinInput,
} from '@mini-erp/shared';

const FALLBACK_API_URL = 'http://127.0.0.1:3000';
const TOKEN_STORAGE_KEY = 'mini_erp_access_token';

/** API base URL: from Electron when running in the desktop app, else from VITE_API_URL. */
export function getApiBaseUrl(): string {
  return window.desktop?.apiBaseUrl ?? import.meta.env.VITE_API_URL ?? FALLBACK_API_URL;
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers,
  });

  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;

  if (!res.ok) {
    const rawMsg = body?.message;
    const msg = Array.isArray(rawMsg)
      ? rawMsg.join(', ')
      : typeof rawMsg === 'string'
        ? rawMsg
        : `HTTP ${res.status}`;
    throw new ApiClientError(msg, res.status);
  }

  return body as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(`${getApiBaseUrl()}${HEALTH_PATH}`);
  return healthResponseSchema.parse(await res.json());
}

export function fetchSetupStatus(): Promise<SetupStatusResponse> {
  return apiRequest<SetupStatusResponse>('/org/setup-status');
}

export function initializeOrganization(input: SetupInitializeInput): Promise<OrganizationDto> {
  return apiRequest<OrganizationDto>('/org/setup', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function loginWithPin(input: LoginInput): Promise<AuthSessionResponse> {
  return apiRequest<AuthSessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchCurrentSession(): Promise<Omit<AuthSessionResponse, 'accessToken'>> {
  return apiRequest<Omit<AuthSessionResponse, 'accessToken'>>('/auth/me');
}

export function verifyCurrentPin(input: VerifyPinInput): Promise<{ verified: true }> {
  return apiRequest<{ verified: true }>('/auth/verify-pin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function changeCurrentPin(input: ChangePinInput): Promise<{ updated: true }> {
  return apiRequest<{ updated: true }>('/auth/change-pin', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateOrganization(input: UpdateOrganizationInput): Promise<OrganizationDto> {
  return apiRequest<OrganizationDto>('/org', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchUsers(query: Partial<UserListQuery>): Promise<PaginatedResponse<UserDto>> {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query.search) params.set('search', query.search);
  if (query.roleId !== undefined) params.set('roleId', String(query.roleId));
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  const qs = params.toString();
  return apiRequest<PaginatedResponse<UserDto>>(`/users${qs ? `?${qs}` : ''}`);
}

export function createUser(input: CreateUserInput): Promise<UserDto> {
  return apiRequest<UserDto>('/users', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateUser(id: number, input: UpdateUserInput): Promise<UserDto> {
  return apiRequest<UserDto>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchRoles(): Promise<readonly RoleWithPermissionsDto[]> {
  return apiRequest<readonly RoleWithPermissionsDto[]>('/roles');
}

export function updateRolePermissions(
  roleId: number,
  input: UpdateRolePermissionsInput,
): Promise<RoleWithPermissionsDto> {
  return apiRequest<RoleWithPermissionsDto>(`/roles/${roleId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
