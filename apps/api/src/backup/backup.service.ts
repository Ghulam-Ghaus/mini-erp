import {
  type BackupLogDto,
  type BackupQueryDto,
  type BackupStatus,
  type BackupSummaryDto,
  type BackupType,
  type PaginatedResponse,
} from '@mini-erp/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AuditService } from '../audit/audit.service.js';
import { inTransaction, nextId } from '../database/gapless-id.js';
import { PrismaService } from '../database/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { executeSqlRestore, generateSqlDump } from './sql-exporter.js';
import { collectDirectoryFiles, createZipBuffer, extractZipBuffer } from './zip-util.js';

const DEFAULT_RETENTION_COUNT = 30;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

@Injectable()
export class BackupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private getBackupDirectory(orgId: number): string {
    const baseDir = process.env['BACKUP_DIR'] || path.resolve(process.cwd(), 'backups');
    const orgDir = path.join(baseDir, `org_${orgId}`);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }
    return orgDir;
  }

  private getUploadsDirectory(): string {
    const uploadsDir = process.env['UPLOADS_DIR'] || path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    return uploadsDir;
  }

  /**
   * Creates a full database and uploads backup compressed in a .zip archive.
   */
  async createBackup(
    orgId: number,
    type: BackupType = 'MANUAL',
    actorUserId?: number | null,
  ): Promise<BackupLogDto> {
    const startedAt = new Date();

    // 1. Create a gapless backup_logs entry with RUNNING status
    const backupId = await inTransaction(this.prisma, async (tx) => {
      const id = await nextId(tx, 'backup_logs');
      await tx.backupLog.create({
        data: {
          id,
          organizationId: orgId,
          type,
          status: 'RUNNING',
          startedAt,
        },
      });
      return id;
    });

    try {
      // 2. Generate SQL Dump of all tables
      const sqlDump = await generateSqlDump(this.prisma);
      const sqlBuffer = Buffer.from(sqlDump, 'utf8');

      // 3. Collect uploaded attachments/proof files
      const uploadsDir = this.getUploadsDirectory();
      const uploadEntries = collectDirectoryFiles(uploadsDir, 'uploads');

      // 4. Create metadata manifest
      const manifest = {
        backupId,
        organizationId: orgId,
        type,
        createdAt: startedAt.toISOString(),
        version: process.env['APP_VERSION'] || '0.1.0',
        fileCount: uploadEntries.length + 1,
        sha256: crypto.createHash('sha256').update(sqlBuffer).digest('hex'),
      };
      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

      // 5. Build PKZIP archive
      const zipBuffer = createZipBuffer([
        { name: 'manifest.json', data: manifestBuffer },
        { name: 'db_dump.sql', data: sqlBuffer },
        ...uploadEntries,
      ]);

      // 6. Save to disk
      const backupDir = this.getBackupDirectory(orgId);
      const filename = `backup_${orgId}_${Date.now()}_${type.toLowerCase()}.zip`;
      const filePath = path.join(backupDir, filename);
      fs.writeFileSync(filePath, zipBuffer);

      const finishedAt = new Date();
      const sizeBytes = zipBuffer.length;

      // 7. Update log status to SUCCESS
      const updated = await this.prisma.backupLog.update({
        where: { id: backupId },
        data: {
          status: 'SUCCESS',
          path: filePath,
          sizeBytes: BigInt(sizeBytes),
          finishedAt,
        },
      });

      // 8. Prune older backups according to retention policy
      await this.pruneOldBackups(orgId, DEFAULT_RETENTION_COUNT);

      // 9. Append audit log
      await this.audit.logStandalone({
        organizationId: orgId,
        userId: actorUserId ?? null,
        action: 'CREATE_BACKUP',
        entity: 'BACKUP',
        entityId: backupId,
        afterJson: {
          type,
          sizeBytes,
          filename,
        },
      });

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        type: updated.type as BackupType,
        status: updated.status as BackupStatus,
        path: updated.path,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        startedAt: updated.startedAt.toISOString(),
        finishedAt: updated.finishedAt ? updated.finishedAt.toISOString() : null,
        error: updated.error,
        createdAt: updated.createdAt.toISOString(),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.prisma.backupLog.update({
        where: { id: backupId },
        data: {
          status: 'FAILED',
          error: errorMsg,
          finishedAt: new Date(),
        },
      });
      throw err;
    }
  }

  /**
   * Enforces retention: keeps the last N backups, auto-deleting older ones.
   */
  async pruneOldBackups(orgId: number, retentionCount = DEFAULT_RETENTION_COUNT): Promise<number> {
    const backups = await this.prisma.backupLog.findMany({
      where: {
        organizationId: orgId,
        status: 'SUCCESS',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length <= retentionCount) {
      return 0;
    }

    const excessBackups = backups.slice(retentionCount);
    let deletedCount = 0;

    for (const b of excessBackups) {
      if (b.path && fs.existsSync(b.path)) {
        try {
          fs.unlinkSync(b.path);
        } catch (e) {
          console.warn(`[backup] Failed to delete file ${b.path}:`, e);
        }
      }
      await this.prisma.backupLog.delete({ where: { id: b.id } });
      deletedCount++;
    }

    return deletedCount;
  }

  /**
   * Restores database and files from a specified backup archive.
   * Safety rule: Always creates an automatic PRE_RESTORE backup before restoring.
   */
  async restoreBackup(
    orgId: number,
    backupId: number,
    confirmCode: string,
    actorUserId?: number | null,
  ): Promise<{
    readonly success: boolean;
    readonly restoredBackupId: number;
    readonly preRestoreBackupId: number;
  }> {
    if (confirmCode !== 'RESTORE') {
      throw new BadRequestException("Confirmation code must be 'RESTORE'");
    }

    const backupRecord = await this.prisma.backupLog.findFirst({
      where: { id: backupId, organizationId: orgId },
    });

    if (!backupRecord || backupRecord.status !== 'SUCCESS' || !backupRecord.path) {
      throw new NotFoundException(`Valid backup with id ${backupId} not found`);
    }

    if (!fs.existsSync(backupRecord.path)) {
      throw new NotFoundException(`Backup file at ${backupRecord.path} no longer exists`);
    }

    // Step 1: Automatic PRE_RESTORE backup before touching anything!
    const preRestore = await this.createBackup(orgId, 'PRE_RESTORE', actorUserId);

    // Step 2: Read archive and extract files
    const zipData = fs.readFileSync(backupRecord.path);
    const entries = extractZipBuffer(zipData);

    const sqlEntry = entries.find((e) => e.name === 'db_dump.sql');
    if (!sqlEntry) {
      throw new BadRequestException('Invalid backup archive: db_dump.sql not found');
    }

    // Step 3: Execute SQL restore
    const sqlText = sqlEntry.data.toString('utf8');
    await executeSqlRestore(this.prisma, sqlText);

    // Step 4: Restore uploads directory if entries present
    const uploadsDir = this.getUploadsDirectory();
    for (const entry of entries) {
      if (entry.name.startsWith('uploads/') && entry.name.length > 'uploads/'.length) {
        const relPath = entry.name.slice('uploads/'.length);
        const targetPath = path.join(uploadsDir, relPath);
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, entry.data);
      }
    }

    // Step 5: Log restore action in AuditLog
    await this.audit.logStandalone({
      organizationId: orgId,
      userId: actorUserId ?? null,
      action: 'RESTORE_DATABASE',
      entity: 'BACKUP',
      entityId: backupId,
      afterJson: {
        preRestoreBackupId: preRestore.id,
        restoredBackupPath: backupRecord.path,
      },
    });

    return {
      success: true,
      restoredBackupId: backupId,
      preRestoreBackupId: preRestore.id,
    };
  }

  async listBackups(
    orgId: number,
    query: BackupQueryDto,
  ): Promise<PaginatedResponse<BackupLogDto>> {
    const where: Prisma.BackupLogWhereInput = {
      organizationId: orgId,
    };
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;

    const [total, items] = await Promise.all([
      this.prisma.backupLog.count({ where }),
      this.prisma.backupLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      data: items.map((b) => {
        const sizeBytes = b.sizeBytes ? Number(b.sizeBytes) : null;
        return {
          id: b.id,
          organizationId: b.organizationId,
          type: b.type as BackupType,
          status: b.status as BackupStatus,
          path: b.path,
          sizeBytes,
          sizeFormatted: sizeBytes !== null ? formatBytes(sizeBytes) : undefined,
          startedAt: b.startedAt.toISOString(),
          finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
          error: b.error,
          createdAt: b.createdAt.toISOString(),
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getSummary(orgId: number): Promise<BackupSummaryDto> {
    const [lastBackup, totalBackups, allSuccess] = await Promise.all([
      this.prisma.backupLog.findFirst({
        where: { organizationId: orgId, status: 'SUCCESS' },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.backupLog.count({
        where: { organizationId: orgId },
      }),
      this.prisma.backupLog.findMany({
        where: { organizationId: orgId, status: 'SUCCESS' },
        select: { sizeBytes: true },
      }),
    ]);

    let totalSizeBytes = 0;
    for (const b of allSuccess) {
      if (b.sizeBytes) totalSizeBytes += Number(b.sizeBytes);
    }

    return {
      lastBackupAt: lastBackup?.finishedAt ? lastBackup.finishedAt.toISOString() : null,
      totalBackups,
      totalSizeBytes,
      retentionCount: DEFAULT_RETENTION_COUNT,
      backupDir: this.getBackupDirectory(orgId),
    };
  }

  async getBackupFilePath(orgId: number, backupId: number): Promise<string> {
    const record = await this.prisma.backupLog.findFirst({
      where: { id: backupId, organizationId: orgId },
    });
    if (!record || !record.path || !fs.existsSync(record.path)) {
      throw new NotFoundException(`Backup file with id ${backupId} not found`);
    }
    return record.path;
  }
}
