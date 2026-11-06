-- CreateTable
CREATE TABLE "id_counters" (
    "table_name" TEXT NOT NULL,
    "last_value" INTEGER NOT NULL,

    CONSTRAINT "id_counters_pkey" PRIMARY KEY ("table_name")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "name_ur" TEXT,
    "logo_path" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "tax_no" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "date_format" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "settings_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL,
    "organization_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_organization_id_idx" ON "users"("organization_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

