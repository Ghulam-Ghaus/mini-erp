import {
  backupQuerySchema,
  createBackupSchema,
  restoreBackupSchema,
  type BackupLogDto,
  type BackupSummaryDto,
  type PaginatedResponse,
} from '@mini-erp/shared';
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res } from '@nestjs/common';
import path from 'node:path';
import {
  CurrentUser,
  RequirePermission,
  type RequestUserContext,
} from '../common/auth.decorators.js';
import { parseWithZod } from '../common/zod-pipe.js';
import { BackupService } from './backup.service.js';

export interface DownloadResponse {
  download(path: string, filename?: string): void;
}

@Controller('backups')
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get()
  @RequirePermission('backup', 'view')
  async list(
    @CurrentUser() auth: RequestUserContext,
    @Query() rawQuery: unknown,
  ): Promise<PaginatedResponse<BackupLogDto>> {
    const query = parseWithZod(backupQuerySchema, rawQuery);
    return this.backupService.listBackups(auth.user.organizationId, query);
  }

  @Get('summary')
  @RequirePermission('backup', 'view')
  async getSummary(@CurrentUser() auth: RequestUserContext): Promise<BackupSummaryDto> {
    return this.backupService.getSummary(auth.user.organizationId);
  }

  @Post('open-folder')
  @RequirePermission('backup', 'view')
  openFolder(@CurrentUser() auth: RequestUserContext): {
    readonly opened: boolean;
    readonly path: string;
  } {
    return this.backupService.openBackupFolder(auth.user.organizationId);
  }

  @Post('manual')
  @RequirePermission('backup', 'create')
  async createManual(
    @CurrentUser() auth: RequestUserContext,
    @Body() body: unknown,
  ): Promise<BackupLogDto> {
    const dto = parseWithZod(createBackupSchema, body ?? {});
    return this.backupService.createBackup(
      auth.user.organizationId,
      dto.type ?? 'MANUAL',
      auth.user.id,
    );
  }

  @Post('restore-file')
  @RequirePermission('backup', 'edit')
  async restoreFromFile(
    @CurrentUser() auth: RequestUserContext,
    @Query('confirmCode') confirmCode: string | undefined,
    @Body() body: unknown,
  ): Promise<{
    readonly success: boolean;
    readonly restoredBackupId: number;
    readonly preRestoreBackupId: number;
  }> {
    const dto = parseWithZod(restoreBackupSchema, { confirmCode });
    const zipBuffer = Buffer.isBuffer(body) ? body : Buffer.alloc(0);
    return this.backupService.restoreBackupFromUpload(
      auth.user.organizationId,
      zipBuffer,
      dto.confirmCode,
      auth.user.id,
    );
  }

  @Post(':id/restore')
  @RequirePermission('backup', 'edit')
  async restore(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ): Promise<{
    readonly success: boolean;
    readonly restoredBackupId: number;
    readonly preRestoreBackupId: number;
  }> {
    const dto = parseWithZod(restoreBackupSchema, body);
    return this.backupService.restoreBackup(
      auth.user.organizationId,
      id,
      dto.confirmCode,
      auth.user.id,
    );
  }

  @Get(':id/download')
  @RequirePermission('backup', 'view')
  async download(
    @CurrentUser() auth: RequestUserContext,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: DownloadResponse,
  ): Promise<void> {
    const filePath = await this.backupService.getBackupFilePath(auth.user.organizationId, id);
    const fileName = path.basename(filePath);
    res.download(filePath, fileName);
  }
}
