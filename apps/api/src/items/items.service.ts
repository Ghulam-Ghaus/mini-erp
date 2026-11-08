import {
  type CreateItemInput,
  type ItemDto,
  type ListItemsQuery,
  type PaginatedResponse,
  type UpdateItemInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { StockService } from '../stock/stock.module.js';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stock: StockService,
  ) {}

  private async toItemDto(
    tx: TxClient | Prisma.TransactionClient,
    organizationId: number,
    item: {
      id: number;
      code: string | null;
      name: string;
      nameUr: string | null;
      category: string | null;
      baseUnit: string;
      defaultTaxRate: Prisma.Decimal;
      notes: string | null;
      isActive: boolean;
      createdAt: Date;
      alternateUnits: {
        id: number;
        unitName: string;
        unitNameUr: string | null;
        conversionFactor: Prisma.Decimal;
        isDefaultForPurchase: boolean;
        isDefaultForSale: boolean;
      }[];
    },
  ): Promise<ItemDto> {
    const [rawStockQtyBase, lastPurchaseLine] = await Promise.all([
      this.stock.getRawItemStock(tx, organizationId, item.id),
      tx.purchaseItem.findFirst({
        where: {
          itemId: item.id,
          purchase: { organizationId, status: { not: 'VOIDED' } },
        },
        orderBy: { id: 'desc' },
      }),
    ]);

    return {
      id: item.id,
      code: item.code,
      name: item.name,
      nameUr: item.nameUr,
      category: item.category,
      baseUnit: item.baseUnit,
      defaultTaxRate: new Decimal(item.defaultTaxRate.toString()).toFixed(2),
      notes: item.notes,
      isActive: item.isActive,
      rawStockQtyBase,
      lastPurchaseRatePerBase: lastPurchaseLine
        ? new Decimal(lastPurchaseLine.ratePerBase.toString()).toFixed(4)
        : null,
      createdAt: item.createdAt.toISOString(),
      alternateUnits: item.alternateUnits.map((u) => ({
        id: u.id,
        unitName: u.unitName,
        unitNameUr: u.unitNameUr,
        conversionFactor: new Decimal(u.conversionFactor.toString()).toFixed(3),
        isDefaultForPurchase: u.isDefaultForPurchase,
        isDefaultForSale: u.isDefaultForSale,
      })),
    };
  }

  async listItems(
    organizationId: number,
    query: ListItemsQuery,
  ): Promise<PaginatedResponse<ItemDto>> {
    const where: Prisma.ItemWhereInput = { organizationId };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.category && query.category.length > 0) {
      where.category = { equals: query.category, mode: 'insensitive' };
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { nameUr: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'name', 'code', 'category', 'baseUnit', 'createdAt']);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.ItemOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.item.count({ where }),
      this.prisma.item.findMany({
        where,
        include: { alternateUnits: { orderBy: { id: 'asc' } } },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    const data = await Promise.all(rows.map((r) => this.toItemDto(this.prisma, organizationId, r)));

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getItemById(organizationId: number, itemId: number): Promise<ItemDto> {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, organizationId },
      include: { alternateUnits: { orderBy: { id: 'asc' } } },
    });
    if (!item) {
      throw new NotFoundException('Item not found');
    }
    return this.toItemDto(this.prisma, organizationId, item);
  }

  async createItem(
    organizationId: number,
    actorUserId: number,
    input: CreateItemInput,
  ): Promise<ItemDto> {
    // Check duplicate alternate unit names
    const unitNames = new Set<string>();
    for (const u of input.alternateUnits) {
      const upper = u.unitName.toUpperCase();
      if (upper === input.baseUnit.toUpperCase()) {
        throw new BadRequestException(
          `Alternate unit "${u.unitName}" cannot be identical to base unit "${input.baseUnit}"`,
        );
      }
      if (unitNames.has(upper)) {
        throw new BadRequestException(`Duplicate alternate unit "${u.unitName}"`);
      }
      unitNames.add(upper);
    }

    return inTransaction(this.prisma, async (tx) => {
      const id = await nextId(tx, 'items');
      await tx.item.create({
        data: {
          id,
          organizationId,
          code: input.code || null,
          name: input.name,
          nameUr: input.nameUr || null,
          category: input.category || null,
          baseUnit: input.baseUnit.toUpperCase(),
          defaultTaxRate: new Prisma.Decimal(
            new Decimal(input.defaultTaxRate).toDecimalPlaces(2).toFixed(2),
          ),
          notes: input.notes || null,
          isActive: input.isActive,
        },
      });

      for (const u of input.alternateUnits) {
        const unitId = await nextId(tx, 'item_units');
        await tx.itemUnit.create({
          data: {
            id: unitId,
            itemId: id,
            unitName: u.unitName.toUpperCase(),
            unitNameUr: u.unitNameUr || null,
            conversionFactor: new Prisma.Decimal(
              new Decimal(u.conversionFactor).toDecimalPlaces(3).toFixed(3),
            ),
            isDefaultForPurchase: u.isDefaultForPurchase,
            isDefaultForSale: u.isDefaultForSale,
          },
        });
      }

      const created = await tx.item.findUniqueOrThrow({
        where: { id },
        include: { alternateUnits: { orderBy: { id: 'asc' } } },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'item',
        entityId: created.id,
        afterJson: {
          id: created.id,
          name: created.name,
          baseUnit: created.baseUnit,
          alternateUnitsCount: created.alternateUnits.length,
        },
      });

      return this.toItemDto(tx, organizationId, created);
    });
  }

  async updateItem(
    organizationId: number,
    actorUserId: number,
    itemId: number,
    input: UpdateItemInput,
  ): Promise<ItemDto> {
    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.item.findFirst({
        where: { id: itemId, organizationId },
        include: { alternateUnits: true },
      });
      if (!existing) {
        throw new NotFoundException('Item not found');
      }

      const nextBaseUnit = (input.baseUnit ?? existing.baseUnit).toUpperCase();

      if (input.alternateUnits !== undefined) {
        const unitNames = new Set<string>();
        for (const u of input.alternateUnits) {
          const upper = u.unitName.toUpperCase();
          if (upper === nextBaseUnit) {
            throw new BadRequestException(
              `Alternate unit "${u.unitName}" cannot match base unit "${nextBaseUnit}"`,
            );
          }
          if (unitNames.has(upper)) {
            throw new BadRequestException(`Duplicate alternate unit "${u.unitName}"`);
          }
          unitNames.add(upper);
        }

        await tx.itemUnit.deleteMany({ where: { itemId: existing.id } });
        for (const u of input.alternateUnits) {
          const unitId = await nextId(tx, 'item_units');
          await tx.itemUnit.create({
            data: {
              id: unitId,
              itemId: existing.id,
              unitName: u.unitName.toUpperCase(),
              unitNameUr: u.unitNameUr || null,
              conversionFactor: new Prisma.Decimal(
                new Decimal(u.conversionFactor).toDecimalPlaces(3).toFixed(3),
              ),
              isDefaultForPurchase: u.isDefaultForPurchase,
              isDefaultForSale: u.isDefaultForSale,
            },
          });
        }
      }

      const updated = await tx.item.update({
        where: { id: existing.id },
        data: {
          ...(input.code !== undefined ? { code: input.code || null } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.nameUr !== undefined ? { nameUr: input.nameUr || null } : {}),
          ...(input.category !== undefined ? { category: input.category || null } : {}),
          ...(input.baseUnit !== undefined ? { baseUnit: nextBaseUnit } : {}),
          ...(input.defaultTaxRate !== undefined
            ? {
                defaultTaxRate: new Prisma.Decimal(
                  new Decimal(input.defaultTaxRate).toDecimalPlaces(2).toFixed(2),
                ),
              }
            : {}),
          ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { alternateUnits: { orderBy: { id: 'asc' } } },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'UPDATE',
        entity: 'item',
        entityId: updated.id,
        beforeJson: {
          name: existing.name,
          baseUnit: existing.baseUnit,
          isActive: existing.isActive,
        },
        afterJson: { name: updated.name, baseUnit: updated.baseUnit, isActive: updated.isActive },
      });

      return this.toItemDto(tx, organizationId, updated);
    });
  }
}
