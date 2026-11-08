-- CreateTable
CREATE TABLE "number_sequences" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "doc_type" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "next_no" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 4,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_no" TEXT,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "category" TEXT,
    "base_unit" TEXT NOT NULL DEFAULT 'KG',
    "default_tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_units" (
    "id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "unit_name" TEXT NOT NULL,
    "unit_name_ur" TEXT,
    "conversion_factor" DECIMAL(12,3) NOT NULL,
    "is_default_for_purchase" BOOLEAN NOT NULL DEFAULT false,
    "is_default_for_sale" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "supplier_ref_no" TEXT,
    "invoice_date" TIMESTAMP(3) NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extra_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "returned_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" INTEGER NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "entered_qty" DECIMAL(12,3) NOT NULL,
    "entered_unit" TEXT NOT NULL,
    "conversion_factor" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "bag_count" INTEGER,
    "qty_base" DECIMAL(12,3) NOT NULL,
    "rate_per_entered_unit" DECIMAL(14,4) NOT NULL,
    "rate_per_base" DECIMAL(14,4) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "allocated_qty_base" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "returned_qty_base" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "return_no" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settlement_type" TEXT NOT NULL DEFAULT 'ADJUST_PAYABLE',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" INTEGER NOT NULL,
    "purchase_return_id" INTEGER NOT NULL,
    "purchase_item_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "entered_qty" DECIMAL(12,3) NOT NULL,
    "entered_unit" TEXT NOT NULL,
    "qty_base" DECIMAL(12,3) NOT NULL,
    "rate_per_base" DECIMAL(14,4) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "batch_id" INTEGER,
    "purchase_item_id" INTEGER,
    "type" TEXT NOT NULL,
    "qty_base" DECIMAL(12,3) NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" INTEGER NOT NULL,
    "ref_no" TEXT,
    "note" TEXT,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "party_type" TEXT NOT NULL,
    "party_id" INTEGER NOT NULL,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "ref_type" TEXT NOT NULL,
    "ref_id" INTEGER NOT NULL,
    "ref_no" TEXT,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "narration" TEXT NOT NULL,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "payment_no" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "party_type" TEXT NOT NULL,
    "party_id" INTEGER NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference_no" TEXT,
    "bank_name" TEXT,
    "cheque_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "invoice_type" TEXT NOT NULL,
    "invoice_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "number_sequences_organization_id_idx" ON "number_sequences"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "number_sequences_organization_id_doc_type_year_key" ON "number_sequences"("organization_id", "doc_type", "year");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_is_active_idx" ON "suppliers"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "suppliers_organization_id_name_idx" ON "suppliers"("organization_id", "name");

-- CreateIndex
CREATE INDEX "items_organization_id_is_active_idx" ON "items"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "items_organization_id_name_idx" ON "items"("organization_id", "name");

-- CreateIndex
CREATE INDEX "item_units_item_id_idx" ON "item_units"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_units_item_id_unit_name_key" ON "item_units"("item_id", "unit_name");

-- CreateIndex
CREATE INDEX "purchase_invoices_organization_id_invoice_date_idx" ON "purchase_invoices"("organization_id", "invoice_date");

-- CreateIndex
CREATE INDEX "purchase_invoices_organization_id_supplier_id_idx" ON "purchase_invoices"("organization_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_invoices_organization_id_status_idx" ON "purchase_invoices"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_organization_id_invoice_no_key" ON "purchase_invoices"("organization_id", "invoice_no");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_item_id_idx" ON "purchase_items"("item_id");

-- CreateIndex
CREATE INDEX "purchase_returns_organization_id_return_date_idx" ON "purchase_returns"("organization_id", "return_date");

-- CreateIndex
CREATE INDEX "purchase_returns_organization_id_supplier_id_idx" ON "purchase_returns"("organization_id", "supplier_id");

-- CreateIndex
CREATE INDEX "purchase_returns_purchase_id_idx" ON "purchase_returns"("purchase_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_organization_id_return_no_key" ON "purchase_returns"("organization_id", "return_no");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_purchase_item_id_idx" ON "purchase_return_items"("purchase_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_item_id_idx" ON "stock_movements"("organization_id", "item_id");

-- CreateIndex
CREATE INDEX "stock_movements_organization_id_batch_id_idx" ON "stock_movements"("organization_id", "batch_id");

-- CreateIndex
CREATE INDEX "stock_movements_ref_type_ref_id_idx" ON "stock_movements"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_party_type_party_id_id_idx" ON "ledger_entries"("organization_id", "party_type", "party_id", "id");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_entry_date_idx" ON "ledger_entries"("organization_id", "entry_date");

-- CreateIndex
CREATE INDEX "ledger_entries_ref_type_ref_id_idx" ON "ledger_entries"("ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_party_type_party_id_idx" ON "payments"("organization_id", "party_type", "party_id");

-- CreateIndex
CREATE INDEX "payments_organization_id_payment_date_idx" ON "payments"("organization_id", "payment_date");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organization_id_payment_no_key" ON "payments"("organization_id", "payment_no");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_type_invoice_id_idx" ON "payment_allocations"("invoice_type", "invoice_id");

-- CreateIndex
CREATE INDEX "attachments_organization_id_owner_type_owner_id_idx" ON "attachments"("organization_id", "owner_type", "owner_id");

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_units" ADD CONSTRAINT "item_units_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchase_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

