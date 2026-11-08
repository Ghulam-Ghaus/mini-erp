-- CreateTable
CREATE TABLE "batches" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "batch_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "item_id" INTEGER,
    "batch_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "raw_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "planned_wastage_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "planned_wastage_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "wastage_percent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "wastage_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "output_kg" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "raw_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extra_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cost" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_per_kg" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_sources" (
    "id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "purchase_item_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "kg_used" DECIMAL(12,3) NOT NULL,
    "rate_per_base" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "notes" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_costs" (
    "id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "cost_type" TEXT NOT NULL,
    "cost_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "is_voided" BOOLEAN NOT NULL DEFAULT false,
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "batches_organization_id_batch_no_key" ON "batches"("organization_id", "batch_no");

-- CreateIndex
CREATE INDEX "batches_organization_id_status_idx" ON "batches"("organization_id", "status");

-- CreateIndex
CREATE INDEX "batches_organization_id_item_id_idx" ON "batches"("organization_id", "item_id");

-- CreateIndex
CREATE INDEX "batches_organization_id_batch_date_idx" ON "batches"("organization_id", "batch_date");

-- CreateIndex
CREATE INDEX "batch_sources_batch_id_idx" ON "batch_sources"("batch_id");

-- CreateIndex
CREATE INDEX "batch_sources_purchase_item_id_idx" ON "batch_sources"("purchase_item_id");

-- CreateIndex
CREATE INDEX "batch_sources_item_id_idx" ON "batch_sources"("item_id");

-- CreateIndex
CREATE INDEX "batch_costs_batch_id_is_voided_idx" ON "batch_costs"("batch_id", "is_voided");

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sources" ADD CONSTRAINT "batch_sources_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sources" ADD CONSTRAINT "batch_sources_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_sources" ADD CONSTRAINT "batch_sources_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_costs" ADD CONSTRAINT "batch_costs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

