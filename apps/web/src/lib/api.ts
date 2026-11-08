import {
  healthResponseSchema,
  HEALTH_PATH,
  type AddBatchAllocationInput,
  type AddBatchCostInput,
  type AdjustBatchStockInput,
  type AuthSessionResponse,
  type AvailablePurchaseItemDto,
  type BatchDetailDto,
  type BatchSummaryDto,
  type ChangePinInput,
  type ClientDto,
  type ClientLedgerQuery,
  type ClientLedgerResponse,
  type CloseBatchInput,
  type CreateBatchInput,
  type CreateClientInput,
  type CreateItemInput,
  type CreatePurchaseInvoiceInput,
  type CreatePurchaseReturnInput,
  type CreateRouteInput,
  type CreateSaleInvoiceInput,
  type CreateSaleReturnInput,
  type CreateSupplierInput,
  type CreateSupplierPaymentInput,
  type CreateUserInput,
  type HealthResponse,
  type ItemDto,
  type ListBatchesQuery,
  type ListClientsQuery,
  type ListItemsQuery,
  type ListPaymentsQuery,
  type ListPurchaseReturnsQuery,
  type ListPurchasesQuery,
  type ListRoutesQuery,
  type ListSaleReturnsQuery,
  type ListSalesQuery,
  type ListStockMovementsQuery,
  type ListSuppliersQuery,
  type LoginInput,
  type OrganizationDto,
  type PaginatedResponse,
  type PaymentDto,
  type PurchaseInvoiceDto,
  type PurchaseReturnDto,
  type RoleWithPermissionsDto,
  type RouteDto,
  type SaleInvoiceDto,
  type SaleReturnDto,
  type SetupInitializeInput,
  type SetupStatusResponse,
  type StockMovementDto,
  type SupplierDto,
  type SupplierLedgerQuery,
  type SupplierLedgerResponse,
  type UpdateBatchWastageInput,
  type UpdateClientInput,
  type UpdateItemInput,
  type UpdateOrganizationInput,
  type UpdateRolePermissionsInput,
  type UpdateRouteInput,
  type UpdateSupplierInput,
  type UpdateUserInput,
  type UserDto,
  type UserListQuery,
  type VerifyPinInput,
  type VoidBatchCostInput,
  type VoidDocumentInput,
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

function buildQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') {
      sp.set(k, String(v));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

// --- Items API ---
export function fetchItems(query: Partial<ListItemsQuery>): Promise<PaginatedResponse<ItemDto>> {
  return apiRequest<PaginatedResponse<ItemDto>>(
    `/items${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      category: query.category,
      isActive: query.isActive,
    })}`,
  );
}

export function createItem(input: CreateItemInput): Promise<ItemDto> {
  return apiRequest<ItemDto>('/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateItem(id: number, input: UpdateItemInput): Promise<ItemDto> {
  return apiRequest<ItemDto>(`/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// --- Suppliers API ---
export function fetchSuppliers(
  query: Partial<ListSuppliersQuery>,
): Promise<PaginatedResponse<SupplierDto>> {
  return apiRequest<PaginatedResponse<SupplierDto>>(
    `/suppliers${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      isActive: query.isActive,
    })}`,
  );
}

export function fetchSupplierById(id: number): Promise<SupplierDto> {
  return apiRequest<SupplierDto>(`/suppliers/${id}`);
}

export function fetchSupplierLedger(
  supplierId: number,
  query: Partial<SupplierLedgerQuery>,
): Promise<SupplierLedgerResponse> {
  return apiRequest<SupplierLedgerResponse>(
    `/suppliers/${supplierId}/ledger${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortOrder: query.sortOrder,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      refType: query.refType,
    })}`,
  );
}

export function createSupplier(input: CreateSupplierInput): Promise<SupplierDto> {
  return apiRequest<SupplierDto>('/suppliers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSupplier(id: number, input: UpdateSupplierInput): Promise<SupplierDto> {
  return apiRequest<SupplierDto>(`/suppliers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// --- Purchases & Purchase Returns API ---
export function fetchPurchaseInvoices(
  query: Partial<ListPurchasesQuery>,
): Promise<PaginatedResponse<PurchaseInvoiceDto>> {
  return apiRequest<PaginatedResponse<PurchaseInvoiceDto>>(
    `/purchases${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      supplierId: query.supplierId,
      itemId: query.itemId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchPurchaseInvoiceById(id: number): Promise<PurchaseInvoiceDto> {
  return apiRequest<PurchaseInvoiceDto>(`/purchases/${id}`);
}

export function createPurchaseInvoice(
  input: CreatePurchaseInvoiceInput,
): Promise<PurchaseInvoiceDto> {
  return apiRequest<PurchaseInvoiceDto>('/purchases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidPurchaseInvoice(
  id: number,
  input: VoidDocumentInput,
): Promise<PurchaseInvoiceDto> {
  return apiRequest<PurchaseInvoiceDto>(`/purchases/${id}/void`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchPurchaseReturns(
  query: Partial<ListPurchaseReturnsQuery>,
): Promise<PaginatedResponse<PurchaseReturnDto>> {
  return apiRequest<PaginatedResponse<PurchaseReturnDto>>(
    `/purchases/returns${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      supplierId: query.supplierId,
      purchaseId: query.purchaseId,
      reasonCode: query.reasonCode,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createPurchaseReturn(input: CreatePurchaseReturnInput): Promise<PurchaseReturnDto> {
  return apiRequest<PurchaseReturnDto>('/purchases/returns', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Payments API ---
export function fetchPayments(
  query: Partial<ListPaymentsQuery>,
): Promise<PaginatedResponse<PaymentDto>> {
  return apiRequest<PaginatedResponse<PaymentDto>>(
    `/payments${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      direction: query.direction,
      partyType: query.partyType,
      partyId: query.partyId,
      method: query.method,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createSupplierPayment(input: CreateSupplierPaymentInput): Promise<PaymentDto> {
  return apiRequest<PaymentDto>('/payments/supplier', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidPayment(id: number, input: VoidDocumentInput): Promise<PaymentDto> {
  return apiRequest<PaymentDto>(`/payments/${id}/void`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Batches & Inventory API ---
export function fetchBatches(
  query: Partial<ListBatchesQuery>,
): Promise<PaginatedResponse<BatchSummaryDto>> {
  return apiRequest<PaginatedResponse<BatchSummaryDto>>(
    `/batches${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      status: query.status,
      itemId: query.itemId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchAvailablePurchaseItems(itemId?: number): Promise<AvailablePurchaseItemDto[]> {
  return apiRequest<AvailablePurchaseItemDto[]>(
    `/batches/available-purchase-items${buildQueryString({ itemId })}`,
  );
}

export function fetchBatchById(id: number): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${id}`);
}

export function createBatch(input: CreateBatchInput): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>('/batches', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addBatchAllocations(
  batchId: number,
  input: AddBatchAllocationInput,
): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/allocations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function addBatchCost(batchId: number, input: AddBatchCostInput): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/costs`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidBatchCost(
  batchId: number,
  costId: number,
  input: VoidBatchCostInput,
): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/costs/${costId}/void`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateBatchWastage(
  batchId: number,
  input: UpdateBatchWastageInput,
): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/wastage`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function closeBatch(batchId: number, input: CloseBatchInput): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/close`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function adjustBatchStock(
  batchId: number,
  input: AdjustBatchStockInput,
): Promise<BatchDetailDto> {
  return apiRequest<BatchDetailDto>(`/batches/${batchId}/adjust-stock`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchStockMovements(
  query: Partial<ListStockMovementsQuery>,
): Promise<PaginatedResponse<StockMovementDto>> {
  return apiRequest<PaginatedResponse<StockMovementDto>>(
    `/batches/inventory/movements${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      itemId: query.itemId,
      batchId: query.batchId,
      type: query.type,
      scope: query.scope,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

// --- Routes API ---
export function fetchRoutes(
  query: Partial<ListRoutesQuery> = {},
): Promise<PaginatedResponse<RouteDto>> {
  return apiRequest<PaginatedResponse<RouteDto>>(
    `/routes${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      isActive: query.isActive,
    })}`,
  );
}

export function fetchRouteById(id: number): Promise<RouteDto> {
  return apiRequest<RouteDto>(`/routes/${id}`);
}

export function createRoute(input: CreateRouteInput): Promise<RouteDto> {
  return apiRequest<RouteDto>('/routes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateRoute(id: number, input: UpdateRouteInput): Promise<RouteDto> {
  return apiRequest<RouteDto>(`/routes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// --- Clients API ---
export function fetchClients(
  query: Partial<ListClientsQuery> = {},
): Promise<PaginatedResponse<ClientDto>> {
  return apiRequest<PaginatedResponse<ClientDto>>(
    `/clients${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      routeId: query.routeId,
      isActive: query.isActive,
    })}`,
  );
}

export function fetchClientById(id: number): Promise<ClientDto> {
  return apiRequest<ClientDto>(`/clients/${id}`);
}

export function createClient(input: CreateClientInput): Promise<ClientDto> {
  return apiRequest<ClientDto>('/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateClient(id: number, input: UpdateClientInput): Promise<ClientDto> {
  return apiRequest<ClientDto>(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchClientLedger(
  clientId: number,
  query: Partial<ClientLedgerQuery>,
): Promise<ClientLedgerResponse> {
  return apiRequest<ClientLedgerResponse>(
    `/clients/${clientId}/ledger${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      refType: query.refType,
    })}`,
  );
}

// --- Sales Invoices API ---
export function fetchSales(
  query: Partial<ListSalesQuery> = {},
): Promise<PaginatedResponse<SaleInvoiceDto>> {
  return apiRequest<PaginatedResponse<SaleInvoiceDto>>(
    `/sales${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      clientId: query.clientId,
      routeId: query.routeId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchSaleById(id: number): Promise<SaleInvoiceDto> {
  return apiRequest<SaleInvoiceDto>(`/sales/${id}`);
}

export function createSale(input: CreateSaleInvoiceInput): Promise<SaleInvoiceDto> {
  return apiRequest<SaleInvoiceDto>('/sales', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidSale(id: number, reason: string): Promise<SaleInvoiceDto> {
  return apiRequest<SaleInvoiceDto>(`/sales/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// --- Sale Returns API ---
export function fetchSaleReturns(
  query: Partial<ListSaleReturnsQuery> = {},
): Promise<PaginatedResponse<SaleReturnDto>> {
  return apiRequest<PaginatedResponse<SaleReturnDto>>(
    `/sale-returns${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      clientId: query.clientId,
      saleId: query.saleId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchSaleReturnById(id: number): Promise<SaleReturnDto> {
  return apiRequest<SaleReturnDto>(`/sale-returns/${id}`);
}

export function createSaleReturn(input: CreateSaleReturnInput): Promise<SaleReturnDto> {
  return apiRequest<SaleReturnDto>('/sale-returns', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidSaleReturn(id: number, reason: string): Promise<SaleReturnDto> {
  return apiRequest<SaleReturnDto>(`/sale-returns/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}
