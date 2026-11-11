import {
  healthResponseSchema,
  HEALTH_PATH,
  type AddBatchAllocationInput,
  type AddBatchCostInput,
  type AdjustBatchStockInput,
  type AuditLogDto,
  type AuditLogQueryDto,
  type AuthSessionResponse,
  type AvailablePurchaseItemDto,
  type BackupLogDto,
  type BackupQueryDto,
  type BackupSummaryDto,
  type BackupType,
  type BatchDetailDto,
  type BatchSummaryDto,
  type ChangePinInput,
  type ChallanDto,
  type ChequeDto,
  type ClientDto,
  type ClientLedgerQuery,
  type ClientLedgerResponse,
  type CloseBatchInput,
  type CreateBatchInput,
  type CreateChallanInput,
  type CreateClientInput,
  type CreateClientPaymentInput,
  type CreateEmployeeInput,
  type CreateExpenseCategoryInput,
  type CreateExpenseInput,
  type CreateItemInput,
  type CreatePurchaseInvoiceInput,
  type CreatePurchaseReturnInput,
  type CreateRecoveryEntryInput,
  type CreateRouteInput,
  type CreateSalaryAdvanceInput,
  type CreateSalaryRecordInput,
  type CreateSaleInvoiceInput,
  type CreateSaleReturnInput,
  type CreateSupplierInput,
  type CreateSupplierPaymentInput,
  type CreateUserInput,
  type DashboardQueryInput,
  type DashboardResponseDto,
  type DetailedSalesReportQueryInput,
  type DetailedSalesReportResponseDto,
  type EmployeeDto,
  type ExpenseCategoryDto,
  type ExpenseDto,
  type ExpensesSummaryDto,
  type HealthResponse,
  type ItemDto,
  type ListBatchesQuery,
  type ListChallansQuery,
  type ListChequesQuery,
  type ListClientsQuery,
  type ListEmployeesQuery,
  type ListExpensesQuery,
  type ListItemsQuery,
  type ListNotificationsQuery,
  type ListPaymentsQuery,
  type ListPurchaseReturnsQuery,
  type ListPurchasesQuery,
  type ListRecoveryEntriesQuery,
  type ListRoutesQuery,
  type ListSalaryAdvancesQuery,
  type ListSalaryRecordsQuery,
  type ListSaleReturnsQuery,
  type ListSalesQuery,
  type ListStockMovementsQuery,
  type ListSuppliersQuery,
  type LoginInput,
  type NetProfitQuery,
  type NetProfitSummaryDto,
  type NotificationDto,
  type NotificationsListResponseDto,
  type OrganizationDto,
  type OtherReportsQueryInput,
  type OtherReportsResponseDto,
  type PaginatedResponse,
  type PaymentDto,
  type PrintTrackResultDto,
  type PurchaseInvoiceDto,
  type PurchaseReturnDto,
  type RecoveryAgingQuery,
  type RecoveryAgingSummaryDto,
  type RecoveryEntryDto,
  type RoleWithPermissionsDto,
  type RouteDto,
  type RunNotificationScanResultDto,
  type SalaryAdvanceDto,
  type SalaryRecordDto,
  type SaleInvoiceDto,
  type SaleReturnDto,
  type SetupInitializeInput,
  type SetupStatusResponse,
  type StockMovementDto,
  type SupplierDto,
  type SupplierLedgerQuery,
  type SupplierLedgerResponse,
  type TodaysRecoveryQuery,
  type TodaysRecoveryResponse,
  type TrackPrintInput,
  type UpdateBatchWastageInput,
  type UpdateChallanStatusInput,
  type UpdateChequeStatusInput,
  type UpdateClientInput,
  type UpdateEmployeeInput,
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

export function createClientPayment(input: CreateClientPaymentInput): Promise<PaymentDto> {
  return apiRequest<PaymentDto>('/payments/client', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchCheques(
  query: Partial<ListChequesQuery>,
): Promise<PaginatedResponse<ChequeDto>> {
  return apiRequest<PaginatedResponse<ChequeDto>>(
    `/payments/cheques${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      direction: query.direction,
      partyType: query.partyType,
      partyId: query.partyId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function updateChequeStatus(id: number, input: UpdateChequeStatusInput): Promise<ChequeDto> {
  return apiRequest<ChequeDto>(`/payments/cheques/${id}/status`, {
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

// --- Recovery API ---
export function fetchTodaysRecovery(
  query: Partial<TodaysRecoveryQuery> = {},
): Promise<TodaysRecoveryResponse> {
  return apiRequest<TodaysRecoveryResponse>(
    `/recovery/today${buildQueryString({
      targetDate: query.targetDate,
      routeId: query.routeId,
      officerId: query.officerId,
      recoveryDay: query.recoveryDay,
      search: query.search,
    })}`,
  );
}

export function fetchRecoveryEntries(
  query: Partial<ListRecoveryEntriesQuery> = {},
): Promise<PaginatedResponse<RecoveryEntryDto>> {
  return apiRequest<PaginatedResponse<RecoveryEntryDto>>(
    `/recovery/entries${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      clientId: query.clientId,
      routeId: query.routeId,
      officerId: query.officerId,
      outcome: query.outcome,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createRecoveryEntry(input: CreateRecoveryEntryInput): Promise<RecoveryEntryDto> {
  return apiRequest<RecoveryEntryDto>('/recovery/entries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchRecoveryAging(
  query: Partial<RecoveryAgingQuery> = {},
): Promise<RecoveryAgingSummaryDto> {
  return apiRequest<RecoveryAgingSummaryDto>(
    `/recovery/aging${buildQueryString({
      asOfDate: query.asOfDate,
      routeId: query.routeId,
      search: query.search,
    })}`,
  );
}

// --- Challans & Print Tracking API ---
export function fetchChallans(
  query: Partial<ListChallansQuery> = {},
): Promise<PaginatedResponse<ChallanDto>> {
  return apiRequest<PaginatedResponse<ChallanDto>>(
    `/challans${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      status: query.status,
      saleId: query.saleId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchChallan(id: number): Promise<ChallanDto> {
  return apiRequest<ChallanDto>(`/challans/${id}`);
}

export function createChallan(input: CreateChallanInput): Promise<ChallanDto> {
  return apiRequest<ChallanDto>('/challans', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateChallanStatus(
  id: number,
  input: UpdateChallanStatusInput,
): Promise<ChallanDto> {
  return apiRequest<ChallanDto>(`/challans/${id}/status`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function trackPrint(input: TrackPrintInput): Promise<PrintTrackResultDto> {
  return apiRequest<PrintTrackResultDto>('/challans/print-track', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// --- Expenses API ---
export function fetchExpenseCategories(): Promise<ExpenseCategoryDto[]> {
  return apiRequest<ExpenseCategoryDto[]>('/expenses/categories');
}

export function createExpenseCategory(
  input: CreateExpenseCategoryInput,
): Promise<ExpenseCategoryDto> {
  return apiRequest<ExpenseCategoryDto>('/expenses/categories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function fetchExpenses(
  query: Partial<ListExpensesQuery> = {},
): Promise<PaginatedResponse<ExpenseDto> & { summary: ExpensesSummaryDto }> {
  return apiRequest<PaginatedResponse<ExpenseDto> & { summary: ExpensesSummaryDto }>(
    `/expenses${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      search: query.search,
      categoryId: query.categoryId,
      batchId: query.batchId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createExpense(input: CreateExpenseInput): Promise<ExpenseDto> {
  return apiRequest<ExpenseDto>('/expenses', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidExpense(id: number, reason: string): Promise<ExpenseDto> {
  return apiRequest<ExpenseDto>(`/expenses/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// --- Payroll API ---
export function fetchEmployees(
  query: Partial<ListEmployeesQuery> = {},
): Promise<PaginatedResponse<EmployeeDto>> {
  return apiRequest<PaginatedResponse<EmployeeDto>>(
    `/payroll/employees${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      payType: query.payType,
      isActive: query.isActive !== undefined ? String(query.isActive) : undefined,
    })}`,
  );
}

export function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
  return apiRequest<EmployeeDto>('/payroll/employees', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateEmployee(id: number, input: UpdateEmployeeInput): Promise<EmployeeDto> {
  return apiRequest<EmployeeDto>(`/payroll/employees/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function fetchSalaryAdvances(
  query: Partial<ListSalaryAdvancesQuery> = {},
): Promise<PaginatedResponse<SalaryAdvanceDto>> {
  return apiRequest<PaginatedResponse<SalaryAdvanceDto>>(
    `/payroll/advances${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      employeeId: query.employeeId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createSalaryAdvance(input: CreateSalaryAdvanceInput): Promise<SalaryAdvanceDto> {
  return apiRequest<SalaryAdvanceDto>('/payroll/advances', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidSalaryAdvance(id: number, reason: string): Promise<SalaryAdvanceDto> {
  return apiRequest<SalaryAdvanceDto>(`/payroll/advances/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function fetchSalaryRecords(
  query: Partial<ListSalaryRecordsQuery> = {},
): Promise<PaginatedResponse<SalaryRecordDto>> {
  return apiRequest<PaginatedResponse<SalaryRecordDto>>(
    `/payroll/salaries${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      employeeId: query.employeeId,
      periodMonth: query.periodMonth,
      payType: query.payType,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function createSalaryRecord(input: CreateSalaryRecordInput): Promise<SalaryRecordDto> {
  return apiRequest<SalaryRecordDto>('/payroll/salaries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function voidSalaryRecord(id: number, reason: string): Promise<SalaryRecordDto> {
  return apiRequest<SalaryRecordDto>(`/payroll/salaries/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export function fetchNetProfitSummary(
  query: Partial<NetProfitQuery> = {},
): Promise<NetProfitSummaryDto> {
  return apiRequest<NetProfitSummaryDto>(
    `/payroll/net-profit-summary${buildQueryString({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

// ============================================================================
// Phase 10: Dashboard & Reports API
// ============================================================================

export function fetchDashboardReport(
  query: Partial<DashboardQueryInput> = {},
): Promise<DashboardResponseDto> {
  return apiRequest<DashboardResponseDto>(
    `/reports/dashboard${buildQueryString({
      preset: query.preset,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

export function fetchDetailedSalesReport(
  query: Partial<DetailedSalesReportQueryInput> = {},
): Promise<DetailedSalesReportResponseDto> {
  return apiRequest<DetailedSalesReportResponseDto>(
    `/reports/detailed-sales${buildQueryString({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      batchId: query.batchId,
      clientId: query.clientId,
      itemId: query.itemId,
      routeId: query.routeId,
      salespersonId: query.salespersonId,
      paymentStatus: query.paymentStatus,
      search: query.search,
    })}`,
  );
}

export function fetchOtherReportsSummary(
  query: Partial<OtherReportsQueryInput> = {},
): Promise<OtherReportsResponseDto> {
  return apiRequest<OtherReportsResponseDto>(
    `/reports/summary${buildQueryString({
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

// ============================================================================
// Phase 11: Notifications API
// ============================================================================

export function fetchNotifications(
  query: Partial<ListNotificationsQuery> = {},
): Promise<NotificationsListResponseDto> {
  return apiRequest<NotificationsListResponseDto>(
    `/notifications${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      type: query.type,
      severity: query.severity,
      unreadOnly: query.unreadOnly,
      search: query.search,
    })}`,
  );
}

export function triggerNotificationScan(): Promise<RunNotificationScanResultDto> {
  return apiRequest<RunNotificationScanResultDto>('/notifications/scan', {
    method: 'POST',
  });
}

export function markNotificationRead(id: number): Promise<NotificationDto> {
  return apiRequest<NotificationDto>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}

export function markAllNotificationsRead(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/notifications/read-all', {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Audit Logs (Phase 12)
// ---------------------------------------------------------------------------

export function fetchAuditLogs(query: AuditLogQueryDto): Promise<PaginatedResponse<AuditLogDto>> {
  return apiRequest<PaginatedResponse<AuditLogDto>>(
    `/audit-logs${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      action: query.action,
      entity: query.entity,
      userId: query.userId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    })}`,
  );
}

// ---------------------------------------------------------------------------
// Backups (Phase 12)
// ---------------------------------------------------------------------------

export function fetchBackupLogs(query: BackupQueryDto): Promise<PaginatedResponse<BackupLogDto>> {
  return apiRequest<PaginatedResponse<BackupLogDto>>(
    `/backups${buildQueryString({
      page: query.page,
      pageSize: query.pageSize,
      type: query.type,
      status: query.status,
    })}`,
  );
}

export function fetchBackupSummary(): Promise<BackupSummaryDto> {
  return apiRequest<BackupSummaryDto>('/backups/summary');
}

export function openBackupFolderApi(): Promise<{
  readonly opened: boolean;
  readonly path: string;
}> {
  return apiRequest<{ readonly opened: boolean; readonly path: string }>('/backups/open-folder', {
    method: 'POST',
  });
}

export function createManualBackup(type: BackupType = 'MANUAL'): Promise<BackupLogDto> {
  return apiRequest<BackupLogDto>('/backups/manual', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export function restoreBackup(
  backupId: number,
  confirmCode: 'RESTORE',
): Promise<{
  readonly success: boolean;
  readonly restoredBackupId: number;
  readonly preRestoreBackupId: number;
}> {
  return apiRequest<{
    readonly success: boolean;
    readonly restoredBackupId: number;
    readonly preRestoreBackupId: number;
  }>(`/backups/${backupId}/restore`, {
    method: 'POST',
    body: JSON.stringify({ confirmCode }),
  });
}

export function getBackupDownloadUrl(backupId: number): string {
  const base = getApiBaseUrl();
  return `${base}/backups/${backupId}/download`;
}

export async function downloadBackupArchive(backupId: number): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(getBackupDownloadUrl(backupId), { headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const rawMsg = body?.message;
    const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : (rawMsg ?? `HTTP ${res.status}`);
    throw new ApiClientError(msg, res.status);
  }
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(disp);
  const filename = match?.[1] ?? `backup-${backupId}.zip`;

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export async function restoreBackupFromFile(
  file: File,
  confirmCode: 'RESTORE',
): Promise<{
  readonly success: boolean;
  readonly restoredBackupId: number;
  readonly preRestoreBackupId: number;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'content-type': 'application/octet-stream',
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(
    `${getApiBaseUrl()}/backups/restore-file?confirmCode=${encodeURIComponent(confirmCode)}`,
    {
      method: 'POST',
      headers,
      body: file,
    },
  );

  const body = (await res.json().catch(() => null)) as
    | { success: boolean; restoredBackupId: number; preRestoreBackupId: number }
    | { message?: string | string[] }
    | null;

  if (!res.ok) {
    const errBody = body as { message?: string | string[] } | null;
    const rawMsg = errBody?.message;
    const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : (rawMsg ?? `HTTP ${res.status}`);
    throw new ApiClientError(msg, res.status);
  }

  return body as {
    readonly success: boolean;
    readonly restoredBackupId: number;
    readonly preRestoreBackupId: number;
  };
}
