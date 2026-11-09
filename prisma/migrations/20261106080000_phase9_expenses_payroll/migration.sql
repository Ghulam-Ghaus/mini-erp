-- CreateTable
CREATE TABLE "expense_categories" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "expense_no" TEXT NOT NULL,
    "expense_date" TIMESTAMP(3) NOT NULL,
    "category_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference_no" TEXT,
    "paid_to" TEXT,
    "batch_id" INTEGER,
    "batch_cost_id" INTEGER,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "cnic" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "designation" TEXT,
    "pay_type" TEXT NOT NULL DEFAULT 'FIXED_MONTHLY',
    "base_rate" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "join_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advances" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "advance_no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "advance_date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "settled_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_records" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "salary_no" TEXT NOT NULL,
    "employee_id" INTEGER NOT NULL,
    "period_month" TEXT NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "pay_type" TEXT NOT NULL,
    "units_worked" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "rate_applied" DECIMAL(14,2) NOT NULL,
    "basic_amount" DECIMAL(14,2) NOT NULL,
    "overtime_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deductions_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_deducted" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(14,2) NOT NULL,
    "batch_id" INTEGER,
    "batch_cost_id" INTEGER,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "void_reason" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_id" INTEGER,
    "created_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_categories_organization_id_is_active_idx" ON "expense_categories"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_organization_id_name_key" ON "expense_categories"("organization_id", "name");

-- CreateIndex
CREATE INDEX "expenses_organization_id_expense_date_idx" ON "expenses"("organization_id", "expense_date");

-- CreateIndex
CREATE INDEX "expenses_organization_id_category_id_idx" ON "expenses"("organization_id", "category_id");

-- CreateIndex
CREATE INDEX "expenses_organization_id_status_idx" ON "expenses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "expenses_batch_id_idx" ON "expenses"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_organization_id_expense_no_key" ON "expenses"("organization_id", "expense_no");

-- CreateIndex
CREATE INDEX "employees_organization_id_is_active_idx" ON "employees"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "employees_organization_id_name_idx" ON "employees"("organization_id", "name");

-- CreateIndex
CREATE INDEX "salary_advances_organization_id_employee_id_status_idx" ON "salary_advances"("organization_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "salary_advances_organization_id_advance_date_idx" ON "salary_advances"("organization_id", "advance_date");

-- CreateIndex
CREATE UNIQUE INDEX "salary_advances_organization_id_advance_no_key" ON "salary_advances"("organization_id", "advance_no");

-- CreateIndex
CREATE INDEX "salary_records_organization_id_employee_id_idx" ON "salary_records"("organization_id", "employee_id");

-- CreateIndex
CREATE INDEX "salary_records_organization_id_payment_date_idx" ON "salary_records"("organization_id", "payment_date");

-- CreateIndex
CREATE INDEX "salary_records_organization_id_period_month_idx" ON "salary_records"("organization_id", "period_month");

-- CreateIndex
CREATE INDEX "salary_records_batch_id_idx" ON "salary_records"("batch_id");

-- CreateIndex
CREATE UNIQUE INDEX "salary_records_organization_id_salary_no_key" ON "salary_records"("organization_id", "salary_no");

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_records" ADD CONSTRAINT "salary_records_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

