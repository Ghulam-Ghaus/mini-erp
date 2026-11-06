import {
  DEFAULT_SYSTEM_ROLES,
  formatPermissionKey,
  organizationSettingsSchema,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type OrganizationDto,
  type SetupInitializeInput,
  type SetupStatusResponse,
  type UpdateOrganizationInput,
} from '@mini-erp/shared';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.module.js';
import { hashPin } from '../auth/security.js';
import { inTransaction, nextId, type TxClient } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Organization, Prisma } from '../generated/prisma/client.js';

export function toOrganizationDto(org: Organization): OrganizationDto {
  const parsedSettings = organizationSettingsSchema.safeParse(org.settingsJson ?? {});
  return {
    id: org.id,
    name: org.name,
    nameUr: org.nameUr,
    logoPath: org.logoPath,
    address: org.address,
    phone: org.phone,
    email: org.email,
    taxNo: org.taxNo,
    currency: org.currency,
    dateFormat: org.dateFormat,
    settings: parsedSettings.success ? parsedSettings.data : organizationSettingsSchema.parse({}),
  };
}

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getSetupStatus(): Promise<SetupStatusResponse> {
    const count = await this.prisma.organization.count();
    return { isInitialized: count > 0 };
  }

  /**
   * Ensures every standard module x action permission exists in `permissions` using gapless IDs.
   */
  private async ensurePermissions(tx: TxClient): Promise<Map<string, number>> {
    const existing = await tx.permission.findMany();
    const map = new Map<string, number>();
    for (const p of existing) {
      map.set(`${p.module}.${p.action}`, p.id);
    }

    for (const mod of PERMISSION_MODULES) {
      for (const act of PERMISSION_ACTIONS) {
        const key = formatPermissionKey(mod, act);
        if (!map.has(key)) {
          const id = await nextId(tx, 'permissions');
          await tx.permission.create({
            data: { id, module: mod, action: act },
          });
          map.set(key, id);
        }
      }
    }
    return map;
  }

  /**
   * First-run wizard initialization (Section 5.1):
   * Creates Organization (#1), seeds Permissions & 6 System Roles (#1..6),
   * creates the Admin User (#1), and writes an AuditLog entry inside a single transaction.
   */
  async initializeFirstRun(input: SetupInitializeInput): Promise<OrganizationDto> {
    const pinHash = await hashPin(input.admin.pin);

    return inTransaction(this.prisma, async (tx) => {
      const existingOrgCount = await tx.organization.count();
      if (existingOrgCount > 0) {
        throw new ConflictException('Organization is already initialized');
      }

      const permissionMap = await this.ensurePermissions(tx);

      const orgId = await nextId(tx, 'organizations');
      const settings = organizationSettingsSchema.parse({
        taxEnabled: input.organization.taxEnabled,
        taxName: input.organization.taxName,
        defaultTaxRate: input.organization.defaultTaxRate,
        inactivityLockMinutes: input.organization.inactivityLockMinutes,
      });

      const org = await tx.organization.create({
        data: {
          id: orgId,
          name: input.organization.name,
          nameUr: input.organization.nameUr || null,
          phone: input.organization.phone || null,
          address: input.organization.address || null,
          email: input.organization.email || null,
          taxNo: input.organization.taxNo || null,
          logoPath: input.organization.logoDataUrl || null,
          currency: input.organization.currency,
          dateFormat: input.organization.dateFormat,
          settingsJson: settings as unknown as Prisma.InputJsonValue,
        },
      });

      let adminRoleId: number | null = null;

      for (const roleDef of DEFAULT_SYSTEM_ROLES) {
        const roleId = await nextId(tx, 'roles');
        await tx.role.create({
          data: {
            id: roleId,
            organizationId: org.id,
            code: roleDef.code,
            name: roleDef.name,
            nameUr: roleDef.nameUr,
            isSystem: true,
          },
        });

        if (roleDef.code === 'ADMIN') {
          adminRoleId = roleId;
        }

        const rolePermRows = roleDef.permissions
          .map((key) => permissionMap.get(key))
          .filter((pid): pid is number => pid !== undefined)
          .map((permissionId) => ({ roleId, permissionId }));

        if (rolePermRows.length > 0) {
          await tx.rolePermission.createMany({ data: rolePermRows });
        }
      }

      if (adminRoleId === null) {
        throw new Error('Failed to create ADMIN role');
      }

      const adminUserId = await nextId(tx, 'users');
      const adminUser = await tx.user.create({
        data: {
          id: adminUserId,
          organizationId: org.id,
          roleId: adminRoleId,
          firstName: input.admin.firstName,
          lastName: input.admin.lastName,
          username: input.admin.username,
          pinHash,
          isActive: true,
        },
      });

      await this.audit.log(tx, {
        organizationId: org.id,
        userId: adminUser.id,
        action: 'SETUP',
        entity: 'organization',
        entityId: org.id,
        afterJson: {
          organizationName: org.name,
          adminUsername: adminUser.username,
        },
      });

      return toOrganizationDto(org);
    });
  }

  async getOrganization(organizationId: number): Promise<OrganizationDto> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return toOrganizationDto(org);
  }

  async updateOrganization(
    organizationId: number,
    userId: number,
    input: UpdateOrganizationInput,
  ): Promise<OrganizationDto> {
    return inTransaction(this.prisma, async (tx) => {
      const existing = await tx.organization.findUnique({ where: { id: organizationId } });
      if (!existing) throw new NotFoundException('Organization not found');

      const beforeDto = toOrganizationDto(existing);
      const nextSettings = organizationSettingsSchema.parse({
        ...beforeDto.settings,
        ...(input.taxEnabled !== undefined ? { taxEnabled: input.taxEnabled } : {}),
        ...(input.taxName !== undefined ? { taxName: input.taxName } : {}),
        ...(input.defaultTaxRate !== undefined ? { defaultTaxRate: input.defaultTaxRate } : {}),
        ...(input.inactivityLockMinutes !== undefined
          ? { inactivityLockMinutes: input.inactivityLockMinutes }
          : {}),
      });

      const updated = await tx.organization.update({
        where: { id: organizationId },
        data: {
          name: input.name,
          ...(input.nameUr !== undefined ? { nameUr: input.nameUr || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.address !== undefined ? { address: input.address || null } : {}),
          ...(input.email !== undefined ? { email: input.email || null } : {}),
          ...(input.taxNo !== undefined ? { taxNo: input.taxNo || null } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.dateFormat !== undefined ? { dateFormat: input.dateFormat } : {}),
          ...(input.logoDataUrl !== undefined ? { logoPath: input.logoDataUrl || null } : {}),
          settingsJson: nextSettings as unknown as Prisma.InputJsonValue,
        },
      });

      const afterDto = toOrganizationDto(updated);

      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'UPDATE',
        entity: 'organization',
        entityId: organizationId,
        beforeJson: { name: beforeDto.name, settings: beforeDto.settings },
        afterJson: { name: afterDto.name, settings: afterDto.settings },
      });

      return afterDto;
    });
  }
}
