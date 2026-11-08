-- CreateTable routes
CREATE TABLE "routes" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "description" TEXT,
    "assigned_officer_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable clients
CREATE TABLE "clients" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "route_id" INTEGER,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "contact_person" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "tax_no" TEXT,
    "credit_limit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recovery_day" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable sales_invoices
CREATE TABLE "sales_invoices" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "invoice_no" TEXT NOT NULL,
    "sale_date" TIMESTAMP(3) NOT NULL,
    "client_id" INTEGER NOT NULL,
    "route_id" INTEGER,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "extra_charges" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_profit" DECIMAL(14,2) NOT NULL DEFAULT 0,
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

    CONSTRAINT "sales_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable sale_items
CREATE TABLE "sale_items" (
    "id" INTEGER NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
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
    "batch_cost_rate_snapshot" DECIMAL(14,4) NOT NULL,
    "line_cogs" DECIMAL(14,2) NOT NULL,
    "line_profit" DECIMAL(14,2) NOT NULL,
    "returned_qty_base" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable sale_returns
CREATE TABLE "sale_returns" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "return_no" TEXT NOT NULL,
    "return_date" TIMESTAMP(3) NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "client_id" INTEGER NOT NULL,
    "reason_code" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settlement_type" TEXT NOT NULL DEFAULT 'ADJUST_BALANCE',
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable sale_return_items
CREATE TABLE "sale_return_items" (
    "id" INTEGER NOT NULL,
    "sale_return_id" INTEGER NOT NULL,
    "sale_item_id" INTEGER NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "entered_qty" DECIMAL(12,3) NOT NULL,
    "entered_unit" TEXT NOT NULL,
    "qty_base" DECIMAL(12,3) NOT NULL,
    "rate_per_base" DECIMAL(14,4) NOT NULL,
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "condition" TEXT NOT NULL DEFAULT 'RESALEABLE',
    "batch_cost_rate_snapshot" DECIMAL(14,4) NOT NULL,
    "cogs_reversed" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "loss_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

-- Unique constraints & indexes
CREATE UNIQUE INDEX "routes_organization_id_name_key" ON "routes"("organization_id", "name");
CREATE INDEX "routes_organization_id_is_active_idx" ON "routes"("organization_id", "is_active");

CREATE INDEX "clients_organization_id_is_active_idx" ON "clients"("organization_id", "is_active");
CREATE INDEX "clients_organization_id_name_idx" ON "clients"("organization_id", "name");
CREATE INDEX "clients_organization_id_route_id_idx" ON "clients"("organization_id", "route_id");

CREATE UNIQUE INDEX "sales_invoices_organization_id_invoice_no_key" ON "sales_invoices"("organization_id", "invoice_no");
CREATE INDEX "sales_invoices_organization_id_sale_date_idx" ON "sales_invoices"("organization_id", "sale_date");
CREATE INDEX "sales_invoices_organization_id_client_id_idx" ON "sales_invoices"("organization_id", "client_id");
CREATE INDEX "sales_invoices_organization_id_route_id_idx" ON "sales_invoices"("organization_id", "route_id");
CREATE INDEX "sales_invoices_organization_id_status_idx" ON "sales_invoices"("organization_id", "status");

CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");
CREATE INDEX "sale_items_batch_id_idx" ON "sale_items"("batch_id");
CREATE INDEX "sale_items_item_id_idx" ON "sale_items"("item_id");

CREATE UNIQUE INDEX "sale_returns_organization_id_return_no_key" ON "sale_returns"("organization_id", "return_no");
CREATE INDEX "sale_returns_organization_id_return_date_idx" ON "sale_returns"("organization_id", "return_date");
CREATE INDEX "sale_returns_organization_id_client_id_idx" ON "sale_returns"("organization_id", "client_id");
CREATE INDEX "sale_returns_sale_id_idx" ON "sale_returns"("sale_id");

CREATE INDEX "sale_return_items_sale_return_id_idx" ON "sale_return_items"("sale_return_id");
CREATE INDEX "sale_return_items_sale_item_id_idx" ON "sale_return_items"("sale_item_id");
CREATE INDEX "sale_return_items_batch_id_idx" ON "sale_return_items"("batch_id");
CREATE INDEX "sale_return_items_item_id_idx" ON "sale_return_items"("item_id");

-- Foreign Keys
ALTER TABLE "routes" ADD CONSTRAINT "routes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "routes" ADD CONSTRAINT "routes_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_return_id_fkey" FOREIGN KEY ("sale_return_id") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

