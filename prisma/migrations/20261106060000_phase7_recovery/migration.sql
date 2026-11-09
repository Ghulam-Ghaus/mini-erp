-- AlterTable clients
ALTER TABLE "clients" ADD COLUMN "promised_date" TIMESTAMP(3),
ADD COLUMN "promised_amount" DECIMAL(14,2);

-- CreateTable recovery_entries
CREATE TABLE "recovery_entries" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "route_id" INTEGER,
    "officer_id" INTEGER NOT NULL,
    "visit_date" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" TEXT,
    "payment_id" INTEGER,
    "next_promised_date" TIMESTAMP(3),
    "promised_amount" DECIMAL(14,2),
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clients_organization_id_promised_date_idx" ON "clients"("organization_id", "promised_date");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_entries_payment_id_key" ON "recovery_entries"("payment_id");

-- CreateIndex
CREATE INDEX "recovery_entries_organization_id_visit_date_idx" ON "recovery_entries"("organization_id", "visit_date");

-- CreateIndex
CREATE INDEX "recovery_entries_organization_id_client_id_idx" ON "recovery_entries"("organization_id", "client_id");

-- CreateIndex
CREATE INDEX "recovery_entries_organization_id_officer_id_idx" ON "recovery_entries"("organization_id", "officer_id");

-- CreateIndex
CREATE INDEX "recovery_entries_organization_id_outcome_idx" ON "recovery_entries"("organization_id", "outcome");

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_officer_id_fkey" FOREIGN KEY ("officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_entries" ADD CONSTRAINT "recovery_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

