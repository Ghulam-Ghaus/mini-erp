import type { AuthenticatedUserDto } from '@mini-erp/shared';
import type { PermissionAction, PermissionModule } from '@mini-erp/shared';
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marks a route as public (does not require a JWT access token). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export interface RequiredPermissionMeta {
  readonly module: PermissionModule;
  readonly action: PermissionAction;
}

/** Requires a specific module + action permission (`ADMIN` passes automatically). */
export const RequirePermission = (module: PermissionModule, action: PermissionAction) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, { module, action } satisfies RequiredPermissionMeta);

export interface RequestUserContext {
  readonly user: AuthenticatedUserDto;
  readonly permissions: readonly string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUserContext => {
    const req = ctx.switchToHttp().getRequest<{ auth?: RequestUserContext }>();
    if (!req.auth) {
      throw new Error('CurrentUser decorator used on a route without an authenticated user');
    }
    return req.auth;
  },
);
