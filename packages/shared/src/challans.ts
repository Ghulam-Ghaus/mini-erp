import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

export const CHALLAN_STATUSES = ['PENDING', 'DISPATCHED', 'DELIVERED', 'CANCELLED'] as const;
export type ChallanStatus = (typeof CHALLAN_STATUSES)[number];

export const PRINT_LANGUAGES = ['EN', 'UR', 'BILINGUAL'] as const;
export type PrintLanguage = (typeof PRINT_LANGUAGES)[number];

export const PRINT_LAYOUTS = ['A4', 'THERMAL_80MM'] as const;
export type PrintLayout = (typeof PRINT_LAYOUTS)[number];

export const PRINT_DOC_TYPES = ['SALE_INVOICE', 'CHALLAN', 'PAYMENT_IN', 'SALE_RETURN'] as const;
export type PrintDocType = (typeof PRINT_DOC_TYPES)[number];

export const createChallanSchema = z.object({
  saleId: z.number().int().positive(),
  challanDate: z.string().min(1),
  riderName: z.string().trim().max(120).optional().nullable(),
  vehicleNo: z.string().trim().max(60).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type CreateChallanInput = z.infer<typeof createChallanSchema>;

export const updateChallanStatusSchema = z.object({
  status: z.enum(['DISPATCHED', 'DELIVERED', 'CANCELLED']),
  receivedBy: z.string().trim().max(120).optional().nullable(),
  cancelReason: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type UpdateChallanStatusInput = z.infer<typeof updateChallanStatusSchema>;

export const listChallansQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CHALLAN_STATUSES).optional(),
  saleId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export type ListChallansQuery = z.infer<typeof listChallansQuerySchema>;

export const trackPrintSchema = z.object({
  docType: z.enum(PRINT_DOC_TYPES),
  docId: z.number().int().positive(),
});

export type TrackPrintInput = z.infer<typeof trackPrintSchema>;

export interface ChallanItemDto {
  id: number;
  itemId: number | null;
  itemName: string | null;
  itemNameUr: string | null;
  batchId: number | null;
  batchNo: string | null;
  batchName?: string | null;
  enteredQty: string;
  enteredUnit: string;
  bagCount: number | null;
  qtyBase: string;
  notes: string | null;
}

export interface ChallanDto {
  id: number;
  challanNo: string;
  saleId: number;
  invoiceNo: string;
  challanDate: string;
  clientId: number;
  clientName: string;
  clientNameUr: string | null;
  clientPhone: string | null;
  clientAddress: string | null;
  routeName: string | null;
  riderName: string | null;
  vehicleNo: string | null;
  status: ChallanStatus;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  receivedBy: string | null;
  notes: string | null;
  printCount: number;
  cancelReason: string | null;
  createdAt: string;
  items: ChallanItemDto[];
}

export interface PrintTrackResultDto {
  docType: PrintDocType;
  docId: number;
  printCount: number;
  isDuplicate: boolean;
  previousBalance: string;
  currentBalance: string;
  organization: {
    name: string;
    nameUr: string | null;
    address: string | null;
    phone: string | null;
    taxNo: string | null;
    currency: string;
  };
}
