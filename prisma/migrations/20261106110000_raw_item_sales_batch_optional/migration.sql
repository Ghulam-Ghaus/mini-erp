-- AlterTable
ALTER TABLE "sale_items" ALTER COLUMN "batch_id" DROP NOT NULL;
ALTER TABLE "sale_items" ALTER COLUMN "item_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sale_return_items" ALTER COLUMN "batch_id" DROP NOT NULL;
ALTER TABLE "sale_return_items" ALTER COLUMN "item_id" DROP NOT NULL;

