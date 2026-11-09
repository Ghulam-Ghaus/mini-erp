-- Phase 11: Notifications & Scheduler
CREATE TABLE "notifications" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "user_id" INTEGER,
    "ref_type" TEXT,
    "ref_id" INTEGER,
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notifications_organization_id_dedupe_key_key" ON "notifications"("organization_id", "dedupe_key");
CREATE INDEX "notifications_organization_id_is_read_created_at_idx" ON "notifications"("organization_id", "is_read", "created_at");
CREATE INDEX "notifications_organization_id_type_idx" ON "notifications"("organization_id", "type");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

