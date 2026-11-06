import {
  formatPermissionKey,
  hasPermission,
  type AuthenticatedUserDto,
  type PermissionAction,
  type PermissionModule,
} from '@mini-erp/shared';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSION_KEY,
  type RequestUserContext,
  type RequiredPermissionMeta,
} from '../common/auth.decorators.js';
import { APP_ENV } from '../config/config.module.js';
import type { AppEnv } from '../config/env.js';
import { PrismaService } from '../database/prisma.service.js';
import { verifyJwt } from './security.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      auth?: RequestUserContext;
    }>();

    const authHeader = req.headers?.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication token required');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    let payload: ReturnType<typeof verifyJwt>;
    try {
      payload = verifyJwt(token, this.env.JWT_SECRET);
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
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
      throw new UnauthorizedException('User account is inactive or does not exist');
    }

    const permissions = user.role.rolePermissions.map((rp) =>
      formatPermissionKey(
        rp.permission.module as PermissionModule,
        rp.permission.action as PermissionAction,
      ),
    );

    const dto: AuthenticatedUserDto = {
      id: user.id,
      organizationId: user.organizationId,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      role: {
        id: user.role.id,
        code: user.role.code,
        name: user.role.name,
        nameUr: user.role.nameUr,
      },
    };

    req.auth = { user: dto, permissions };
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<RequiredPermissionMeta | undefined>(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const req = context.switchToHttp().getRequest<{ auth?: RequestUserContext }>();
    if (!req.auth) {
      throw new UnauthorizedException('Authentication required');
    }

    const allowed = hasPermission(
      req.auth.permissions,
      req.auth.user.role.code,
      required.module,
      required.action,
    );

    if (!allowed) {
      throw new ForbiddenException(
        `Missing required permission: ${required.module}.${required.action}`,
      );
    }

    return true;
  }
}
