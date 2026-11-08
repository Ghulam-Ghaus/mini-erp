import { Global, Injectable, Module } from '@nestjs/common';
import {
  DEFAULT_DOCUMENT_PREFIXES,
  formatDocumentNumber,
  type DocumentType,
} from '@mini-erp/shared';
import { nextId, type TxClient } from '../database/gapless-id.js';

@Injectable()
export class NumberingService {
  /**
   * Generates the next gapless document number (e.g. PUR-2026-0001) inside the active transaction.
   * Uses `SELECT ... FOR UPDATE` on the sequence row so concurrent requests serialize and
   * any transaction rollback also rolls back the increment.
   */
  async nextDocumentNumber(
    tx: TxClient,
    organizationId: number,
    docType: DocumentType,
    date: Date = new Date(),
  ): Promise<string> {
    const year = date.getUTCFullYear();
    const defaultPrefix = DEFAULT_DOCUMENT_PREFIXES[docType];

    // Check and lock existing sequence row for (organizationId, docType, year)
    const rows = await tx.$queryRaw<
      { id: number; prefix: string; next_no: number; padding: number }[]
    >`
      SELECT "id", "prefix", "next_no", "padding"
      FROM "number_sequences"
      WHERE "organization_id" = ${organizationId}
        AND "doc_type" = ${docType}
        AND "year" = ${year}
      FOR UPDATE
    `;

    const existing = rows[0];
    if (existing) {
      const allocatedNo = existing.next_no;
      await tx.numberSequence.update({
        where: { id: existing.id },
        data: { nextNo: allocatedNo + 1 },
      });
      return formatDocumentNumber(existing.prefix, year, allocatedNo, existing.padding);
    }

    const id = await nextId(tx, 'number_sequences');
    const created = await tx.numberSequence.create({
      data: {
        id,
        organizationId,
        docType,
        prefix: defaultPrefix,
        nextNo: 2,
        year,
        padding: 4,
      },
    });
    return formatDocumentNumber(created.prefix, year, 1, created.padding);
  }
}

@Global()
@Module({
  providers: [NumberingService],
  exports: [NumberingService],
})
export class NumberingModule {}
