-- CreateTable cheques
CREATE TABLE "cheques" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "party_type" TEXT NOT NULL,
    "party_id" INTEGER NOT NULL,
    "cheque_no" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "cheque_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "deposit_date" TIMESTAMP(3),
    "deposit_bank" TEXT,
    "cleared_date" TIMESTAMP(3),
    "bounced_date" TIMESTAMP(3),
    "bounce_reason" TEXT,
    "bounce_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cheques_payment_id_key" ON "cheques"("payment_id");

-- CreateIndex
CREATE INDEX "cheques_organization_id_status_idx" ON "cheques"("organization_id", "status");

-- CreateIndex
CREATE INDEX "cheques_organization_id_cheque_date_idx" ON "cheques"("organization_id", "cheque_date");

-- CreateIndex
CREATE INDEX "cheques_organization_id_party_type_party_id_idx" ON "cheques"("organization_id", "party_type", "party_id");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

