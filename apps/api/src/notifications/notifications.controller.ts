import {
  listNotificationsQuerySchema,
  type NotificationDto,
  type NotificationsListResponseDto,
  type RunNotificationScanResultDto,
} from '@mini-erp/shared';
import { Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @RequirePermission('notifications', 'view')
  async listNotifications(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<NotificationsListResponseDto> {
    const query = parseWithZod(listNotificationsQuerySchema, rawQuery);
    return this.notificationsService.listNotifications(auth.user.organizationId, query);
  }

  @Post('scan')
  @RequirePermission('notifications', 'view')
  async scanNotifications(
    @CurrentUser() auth: RequestUserContext,
  ): Promise<RunNotificationScanResultDto> {
    return this.notificationsService.scanAndGenerate(auth.user.organizationId);
  }

  @Post(':id/read')
  @RequirePermission('notifications', 'view')
  async markAsRead(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<NotificationDto> {
    return this.notificationsService.markAsRead(auth.user.organizationId, id);
  }

  @Post('read-all')
  @RequirePermission('notifications', 'view')
  async markAllAsRead(@CurrentUser() auth: RequestUserContext): Promise<{ count: number }> {
    return this.notificationsService.markAllAsRead(auth.user.organizationId);
  }
}
