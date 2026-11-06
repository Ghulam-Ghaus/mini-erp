import {
  setupInitializeSchema,
  updateOrganizationSchema,
  type OrganizationDto,
  type SetupStatusResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import {
  CurrentUser,
  Public,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { OrgService } from './org.service.js';

@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Public()
  @Get('setup-status')
  getSetupStatus(): Promise<SetupStatusResponse> {
    return this.orgService.getSetupStatus();
  }

  @Public()
  @Post('setup')
  initialize(@Body() body: unknown): Promise<OrganizationDto> {
    const input = parseWithZod(setupInitializeSchema, body);
    return this.orgService.initializeFirstRun(input);
  }

  @RequirePermission('settings', 'view')
  @Get()
  getOrganization(@CurrentUser() auth: RequestUserContext): Promise<OrganizationDto> {
    return this.orgService.getOrganization(auth.user.organizationId);
  }

  @RequirePermission('settings', 'edit')
  @Patch()
  updateOrganization(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<OrganizationDto> {
    const input = parseWithZod(updateOrganizationSchema, body);
    return this.orgService.updateOrganization(auth.user.organizationId, auth.user.id, input);
  }
}
