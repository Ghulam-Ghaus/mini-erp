import { z } from 'zod';

export const DOCUMENT_TYPES = [
  'PURCHASE_INVOICE',
  'PURCHASE_RETURN',
  'PAYMENT_OUT',
  'BATCH',
  'SALE_INVOICE',
  'SALE_RETURN',
  'CHALLAN',
  'PAYMENT_IN',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DEFAULT_DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  PURCHASE_INVOICE: 'PUR',
  PURCHASE_RETURN: 'PRN',
  PAYMENT_OUT: 'PAY-OUT',
  BATCH: 'BAT',
  SALE_INVOICE: 'INV',
  SALE_RETURN: 'CRN',
  CHALLAN: 'CH',
  PAYMENT_IN: 'RCP',
};

export const numberSequenceDtoSchema = z.object({
  id: z.number().int().positive(),
  docType: z.enum(DOCUMENT_TYPES),
  prefix: z.string(),
  nextNo: z.number().int().positive(),
  year: z.number().int(),
  padding: z.number().int().min(2).max(8),
});

export type NumberSequenceDto = z.infer<typeof numberSequenceDtoSchema>;

/**
 * Formats a gapless document number such as "PUR-2026-0001".
 */
export function formatDocumentNumber(
  prefix: string,
  year: number,
  seqNo: number,
  padding = 4,
): string {
  const padded = String(seqNo).padStart(padding, '0');
  return `${prefix}-${year}-${padded}`;
}
