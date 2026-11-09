-- AlterTable
ALTER TABLE "purchase_invoices" ADD COLUMN "print_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "print_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoices" ADD COLUMN "print_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sale_returns" ADD COLUMN "print_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "challans" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "challan_no" TEXT NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "challan_date" TIMESTAMP(3) NOT NULL,
    "rider_name" TEXT,
    "vehicle_no" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "received_by" TEXT,
    "notes" TEXT,
    "print_count" INTEGER NOT NULL DEFAULT 0,
    "cancel_reason" TEXT,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challans_organization_id_challan_date_idx" ON "challans"("organization_id", "challan_date");

-- CreateIndex
CREATE INDEX "challans_organization_id_status_idx" ON "challans"("organization_id", "status");

-- CreateIndex
CREATE INDEX "challans_sale_id_idx" ON "challans"("sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "challans_organization_id_challan_no_key" ON "challans"("organization_id", "challan_no");

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challans" ADD CONSTRAINT "challans_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

