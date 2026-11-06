import {
  formatPermissionKey,
  type CreateUserInput,
  type PaginatedResponse,
  type PermissionAction,
  type PermissionModule,
  type RoleWithPermissionsDto,
  type UpdateRolePermissionsInput,
  type UpdateUserInput,
  type UserDto,
  type UserListQuery,
} from '@mini-erp/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.module.js';
import { hashPin } from '../auth/security.js';
import { inTransaction, nextId } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listUsers(
    organizationId: number,
    query: UserListQuery,
  ): Promise<PaginatedResponse<UserDto>> {
    const where: Prisma.UserWhereInput = { organizationId };

    if (query.roleId !== undefined) {
      where.roleId = query.roleId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    if (query.search && query.search.trim().length > 0) {
      const q = query.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ];
    }

    const allowedSortFields = new Set(['id', 'username', 'firstName', 'lastName', 'createdAt']);
    const sortField = query.sortBy && allowedSortFields.has(query.sortBy) ? query.sortBy : 'id';
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortField]: query.sortOrder,
    };

    const skip = (query.page - 1) * query.pageSize;

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy,
        skip,
        take: query.pageSize,
      }),
    ]);

    const data: UserDto[] = rows.map((u) => ({
      id: u.id,
      organizationId: u.organizationId,
      firstName: u.firstName,
      lastName: u.lastName,
      username: u.username,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      role: {
        id: u.role.id,
        code: u.role.code,
        name: u.role.name,
        nameUr: u.role.nameUr,
      },
    }));

    return {
      data,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async createUser(
    organizationId: number,
    actorUserId: number,
    input: CreateUserInput,
  ): Promise<UserDto> {
    const pinHash = await hashPin(input.pin);

    return inTransaction(this.prisma, async (tx) => {
      const existingUsername = await tx.user.findUnique({
        where: { username: input.username },
      });
      if (existingUsername) {
        throw new ConflictException(`Username "${input.username}" is already taken`);
      }

      const role = await tx.role.findFirst({
        where: { id: input.roleId, organizationId },
      });
      if (!role) {
        throw new BadRequestException('Selected role does not exist');
      }

      const id = await nextId(tx, 'users');
      const created = await tx.user.create({
        data: {
          id,
          organizationId,
          roleId: role.id,
          firstName: input.firstName,
          lastName: input.lastName,
          username: input.username,
          pinHash,
          isActive: input.isActive,
        },
        include: { role: true },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'CREATE',
        entity: 'user',
        entityId: created.id,
        afterJson: {
          id: created.id,
          username: created.username,
          roleCode: created.role.code,
          isActive: created.isActive,
        },
      });

      return {
        id: created.id,
        organizationId: created.organizationId,
        firstName: created.firstName,
        lastName: created.lastName,
        username: created.username,
        isActive: created.isActive,
        lastLoginAt: created.lastLoginAt ? created.lastLoginAt.toISOString() : null,
        createdAt: created.createdAt.toISOString(),
        role: {
          id: created.role.id,
          code: created.role.code,
          name: created.role.name,
          nameUr: created.role.nameUr,
        },
      };
    });
  }

  async updateUser(
    organizationId: number,
    actorUserId: number,
    targetUserId: number,
    input: UpdateUserInput,
  ): Promise<UserDto> {
    const newPinHash = input.newPin ? await hashPin(input.newPin) : undefined;

    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.user.findFirst({
        where: { id: targetUserId, organizationId },
        include: { role: true },
      });
      if (!existing) {
        throw new NotFoundException('User not found');
      }

      if (input.isActive === false && targetUserId === actorUserId) {
        throw new BadRequestException('You cannot deactivate your own account');
      }

      if (input.roleId !== undefined) {
        const targetRole = await tx.role.findFirst({
          where: { id: input.roleId, organizationId },
        });
        if (!targetRole) {
          throw new BadRequestException('Selected role does not exist');
        }
      }

      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(newPinHash !== undefined ? { pinHash: newPinHash } : {}),
        },
        include: { role: true },
      });

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'UPDATE',
        entity: 'user',
        entityId: updated.id,
        beforeJson: {
          firstName: existing.firstName,
          lastName: existing.lastName,
          roleId: existing.roleId,
          isActive: existing.isActive,
        },
        afterJson: {
          firstName: updated.firstName,
          lastName: updated.lastName,
          roleId: updated.roleId,
          isActive: updated.isActive,
          pinReset: Boolean(newPinHash),
        },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        firstName: updated.firstName,
        lastName: updated.lastName,
        username: updated.username,
        isActive: updated.isActive,
        lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(),
        role: {
          id: updated.role.id,
          code: updated.role.code,
          name: updated.role.name,
          nameUr: updated.role.nameUr,
        },
      };
    });
  }

  async listRoles(organizationId: number): Promise<readonly RoleWithPermissionsDto[]> {
    const roles = await this.prisma.role.findMany({
      where: { organizationId },
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { users: true } },
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      nameUr: r.nameUr,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.rolePermissions.map((rp) =>
        formatPermissionKey(
          rp.permission.module as PermissionModule,
          rp.permission.action as PermissionAction,
        ),
      ),
    }));
  }

  async updateRolePermissions(
    organizationId: number,
    actorUserId: number,
    roleId: number,
    input: UpdateRolePermissionsInput,
  ): Promise<RoleWithPermissionsDto> {
    return inTransaction(this.prisma, async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, organizationId },
        include: {
          _count: { select: { users: true } },
          rolePermissions: { include: { permission: true } },
        },
      });

      if (!role) {
        throw new NotFoundException('Role not found');
      }

      if (role.code === 'ADMIN') {
        throw new BadRequestException('ADMIN role always retains all permissions');
      }

      const allPerms = await tx.permission.findMany();
      const keyToId = new Map<string, number>();
      for (const p of allPerms) {
        keyToId.set(`${p.module}.${p.action}`, p.id);
      }

      const uniqueKeys = [...new Set(input.permissions)];
      const permissionIds = uniqueKeys
        .map((k) => keyToId.get(k))
        .filter((pid): pid is number => pid !== undefined);

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
        });
      }

      await this.audit.log(tx, {
        organizationId,
        userId: actorUserId,
        action: 'UPDATE',
        entity: 'role_permissions',
        entityId: role.id,
        beforeJson: {
          roleCode: role.code,
          permissions: role.rolePermissions.map(
            (rp) => `${rp.permission.module}.${rp.permission.action}`,
          ),
        },
        afterJson: {
          roleCode: role.code,
          permissions: uniqueKeys,
        },
      });

      return {
        id: role.id,
        code: role.code,
        name: role.name,
        nameUr: role.nameUr,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: uniqueKeys,
      };
    });
  }
}
