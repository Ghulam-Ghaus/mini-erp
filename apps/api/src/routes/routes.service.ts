import {
  type CreateRouteInput,
  type ListRoutesQuery,
  type PaginatedResponse,
  type RouteDto,
  type UpdateRouteInput,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.module.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  toRouteDto(route: {
    id: number;
    code: string | null;
    name: string;
    nameUr: string | null;
    description: string | null;
    assignedOfficerId: number | null;
    isActive: boolean;
    createdAt: Date;
    assignedOfficer?: { firstName: string; lastName: string } | null;
    _count?: { clients: number };
  }): RouteDto {
    return {
      id: route.id,
      code: route.code,
      name: route.name,
      nameUr: route.nameUr,
      description: route.description,
      assignedOfficerId: route.assignedOfficerId,
      assignedOfficerName: route.assignedOfficer
        ? `${route.assignedOfficer.firstName} ${route.assignedOfficer.lastName}`.trim()
        : null,
      clientCount: route._count?.clients ?? 0,
      isActive: route.isActive,
      createdAt: route.createdAt.toISOString(),
    };
  }

  async listRoutes(
    organizationId: number,
    query: ListRoutesQuery,
  ): Promise<PaginatedResponse<RouteDto>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize ?? 25));
    const skip = (page - 1) * pageSize;

    const where: Prisma.RouteWhereInput = {
      organizationId,
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { nameUr: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.route.count({ where }),
      this.prisma.route.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
        include: {
          assignedOfficer: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: { clients: true },
          },
        },
      }),
    ]);

    return {
      data: rows.map((r) => this.toRouteDto(r)),
      total,
      page,
      pageSize,
    };
  }

  async getRouteById(organizationId: number, id: number): Promise<RouteDto> {
    const row = await this.prisma.route.findFirst({
      where: { id, organizationId },
      include: {
        assignedOfficer: {
          select: { firstName: true, lastName: true },
        },
        _count: {
          select: { clients: true },
        },
      },
    });

    if (!row) {
      throw new NotFoundException(`Route with id ${id} not found`);
    }

    return this.toRouteDto(row);
  }

  async createRoute(
    organizationId: number,
    input: CreateRouteInput,
    userId: number,
  ): Promise<RouteDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const existing = await tx.route.findFirst({
        where: {
          organizationId,
          name: { equals: input.name, mode: 'insensitive' },
        },
      });

      if (existing) {
        throw new BadRequestException(`Route named "${input.name}" already exists`);
      }

      if (input.assignedOfficerId) {
        const officer = await tx.user.findFirst({
          where: { id: input.assignedOfficerId, organizationId, isActive: true },
        });
        if (!officer) {
          throw new BadRequestException(`Assigned officer not found`);
        }
      }

      const id = await nextId(tx, 'routes');
      const created = await tx.route.create({
        data: {
          id,
          organizationId,
          code: input.code?.trim() || null,
          name: input.name.trim(),
          nameUr: input.nameUr?.trim() || null,
          description: input.description?.trim() || null,
          assignedOfficerId: input.assignedOfficerId ?? null,
          isActive: input.isActive,
        },
        include: {
          assignedOfficer: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: { clients: true },
          },
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'CREATE',
        entity: 'Route',
        entityId: created.id,
        afterJson: {
          id: created.id,
          name: created.name,
          assignedOfficerId: created.assignedOfficerId,
        },
      });

      return this.toRouteDto(created);
    });
  }

  async updateRoute(
    organizationId: number,
    id: number,
    input: UpdateRouteInput,
    userId: number,
  ): Promise<RouteDto> {
    return inTransaction(this.prisma, async (tx: TxClient) => {
      const existing = await tx.route.findFirst({
        where: { id, organizationId },
      });

      if (!existing) {
        throw new NotFoundException(`Route with id ${id} not found`);
      }

      if (input.name && input.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
        const dup = await tx.route.findFirst({
          where: {
            organizationId,
            name: { equals: input.name.trim(), mode: 'insensitive' },
            id: { not: id },
          },
        });
        if (dup) {
          throw new BadRequestException(`Route named "${input.name}" already exists`);
        }
      }

      if (input.assignedOfficerId) {
        const officer = await tx.user.findFirst({
          where: { id: input.assignedOfficerId, organizationId, isActive: true },
        });
        if (!officer) {
          throw new BadRequestException(`Assigned officer not found`);
        }
      }

      const updated = await tx.route.update({
        where: { id },
        data: {
          code: input.code !== undefined ? input.code?.trim() || null : undefined,
          name: input.name ? input.name.trim() : undefined,
          nameUr: input.nameUr !== undefined ? input.nameUr?.trim() || null : undefined,
          description:
            input.description !== undefined ? input.description?.trim() || null : undefined,
          assignedOfficerId:
            input.assignedOfficerId !== undefined ? input.assignedOfficerId : undefined,
          isActive: input.isActive !== undefined ? input.isActive : undefined,
        },
        include: {
          assignedOfficer: {
            select: { firstName: true, lastName: true },
          },
          _count: {
            select: { clients: true },
          },
        },
      });

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE',
        entity: 'Route',
        entityId: updated.id,
        beforeJson: {
          name: existing.name,
          assignedOfficerId: existing.assignedOfficerId,
          isActive: existing.isActive,
        },
        afterJson: {
          name: updated.name,
          assignedOfficerId: updated.assignedOfficerId,
          isActive: updated.isActive,
        },
      });

      return this.toRouteDto(updated);
    });
  }
}
