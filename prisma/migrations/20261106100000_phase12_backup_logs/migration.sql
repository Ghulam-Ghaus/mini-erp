-- CreateTable
CREATE TABLE "backup_logs" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "path" TEXT,
    "size_bytes" BIGINT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "backup_logs_organization_id_created_at_idx" ON "backup_logs"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "backup_logs_organization_id_status_idx" ON "backup_logs"("organization_id", "status");

-- AddForeignKey
ALTER TABLE "backup_logs" ADD CONSTRAINT "backup_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

