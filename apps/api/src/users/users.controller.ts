import {
  createUserSchema,
  updateRolePermissionsSchema,
  updateUserSchema,
  userListQuerySchema,
  type PaginatedResponse,
  type RoleWithPermissionsDto,
  type UserDto,
} from '@mini-erp/shared';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { UsersService } from './users.service.js';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission('users', 'view')
  @Get('users')
  listUsers(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<UserDto>> {
    const query = parseWithZod(userListQuerySchema, rawQuery);
    return this.usersService.listUsers(auth.user.organizationId, query);
  }

  @RequirePermission('users', 'create')
  @Post('users')
  createUser(@CurrentUser() auth: RequestUserContext, @Body() body: unknown): Promise<UserDto> {
    const input = parseWithZod(createUserSchema, body);
    return this.usersService.createUser(auth.user.organizationId, auth.user.id, input);
  }

  @RequirePermission('users', 'edit')
  @Patch('users/:id')
  updateUser(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<UserDto> {
    const input = parseWithZod(updateUserSchema, body);
    return this.usersService.updateUser(auth.user.organizationId, auth.user.id, id, input);
  }

  @RequirePermission('users', 'view')
  @Get('roles')
  listRoles(@CurrentUser() auth: RequestUserContext): Promise<readonly RoleWithPermissionsDto[]> {
    return this.usersService.listRoles(auth.user.organizationId);
  }

  @RequirePermission('users', 'edit')
  @Put('roles/:id/permissions')
  updateRolePermissions(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<RoleWithPermissionsDto> {
    const input = parseWithZod(updateRolePermissionsSchema, body);
    return this.usersService.updateRolePermissions(
      auth.user.organizationId,
      auth.user.id,
      id,
      input,
    );
  }
}
