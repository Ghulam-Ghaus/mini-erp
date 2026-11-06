import {
  formatPermissionKey,
  type AuthSessionResponse,
  type ChangePinInput,
  type LoginInput,
  type PermissionAction,
  type PermissionModule,
  type VerifyPinInput,
} from '@mini-erp/shared';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.module.js';
import type { RequestUserContext } from '../common/auth.decorators.js';
import { APP_ENV } from '../config/config.module.js';
import type { AppEnv } from '../config/env.js';
import { inTransaction } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import { toOrganizationDto } from '../org/org.service.js';
import { hashPin, signJwt, verifyPinHash } from './security.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async login(input: LoginInput): Promise<AuthSessionResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username: input.username },
      include: {
        organization: true,
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid username or PIN');
    }

    const pinValid = await verifyPinHash(input.pin, user.pinHash);
    if (!pinValid) {
      throw new UnauthorizedException('Invalid username or PIN');
    }

    const now = new Date();
    await inTransaction(this.prisma, async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now },
      });
      await this.audit.log(tx, {
        organizationId: user.organizationId,
        userId: user.id,
        action: 'LOGIN',
        entity: 'user',
        entityId: user.id,
      });
    });

    const permissions = user.role.rolePermissions.map((rp) =>
      formatPermissionKey(
        rp.permission.module as PermissionModule,
        rp.permission.action as PermissionAction,
      ),
    );

    const accessToken = signJwt(
      { sub: user.id, orgId: user.organizationId, roleCode: user.role.code },
      this.env.JWT_SECRET,
    );

    return {
      accessToken,
      user: {
        id: user.id,
        organizationId: user.organizationId,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        isActive: user.isActive,
        lastLoginAt: now.toISOString(),
        role: {
          id: user.role.id,
          code: user.role.code,
          name: user.role.name,
          nameUr: user.role.nameUr,
        },
      },
      organization: toOrganizationDto(user.organization),
      permissions,
    };
  }

  async getSession(auth: RequestUserContext): Promise<Omit<AuthSessionResponse, 'accessToken'>> {
    const org = await this.prisma.organization.findUnique({
      where: { id: auth.user.organizationId },
    });
    if (!org) {
      throw new UnauthorizedException('Organization not found');
    }
    return {
      user: auth.user,
      organization: toOrganizationDto(org),
      permissions: auth.permissions,
    };
  }

  async verifyCurrentUserPin(userId: number, input: VerifyPinInput): Promise<{ verified: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not active');
    }
    const valid = await verifyPinHash(input.pin, user.pinHash);
    if (!valid) {
      throw new UnauthorizedException('Incorrect PIN');
    }
    return { verified: true };
  }

  async changePin(
    userId: number,
    organizationId: number,
    input: ChangePinInput,
  ): Promise<{ updated: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not active');
    }
    const valid = await verifyPinHash(input.currentPin, user.pinHash);
    if (!valid) {
      throw new BadRequestException('Current PIN is incorrect');
    }

    const newPinHash = await hashPin(input.newPin);
    await inTransaction(this.prisma, async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { pinHash: newPinHash },
      });
      await this.audit.log(tx, {
        organizationId,
        userId,
        action: 'PIN_CHANGE',
        entity: 'user',
        entityId: userId,
      });
    });

    return { updated: true };
  }
}
