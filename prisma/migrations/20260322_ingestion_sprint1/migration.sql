-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "StagingStatus" AS ENUM ('PENDING', 'PROMOTED', 'REJECTED', 'DUPLICATE');

-- AlterTable
ALTER TABLE "supermarkets"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "freshness_sla_hours" INTEGER NOT NULL DEFAULT 12;

-- CreateTable
CREATE TABLE "ingestion_run" (
    "id" SERIAL NOT NULL,
    "batch_id" TEXT NOT NULL,
    "source_slug" TEXT NOT NULL,
    "supermarket_id" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "queries_sent" INTEGER NOT NULL DEFAULT 0,
    "products_fetched" INTEGER NOT NULL DEFAULT 0,
    "products_staged" INTEGER NOT NULL DEFAULT 0,
    "products_promoted" INTEGER NOT NULL DEFAULT 0,
    "products_rejected" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "vtex_hash" TEXT,
    "duration_ms" INTEGER,

    CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staging_product" (
    "id" SERIAL NOT NULL,
    "run_id" INTEGER NOT NULL,
    "source_slug" TEXT NOT NULL,
    "ean" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "sku_id" TEXT,
    "seller_id" TEXT,
    "product_url" TEXT,
    "price" DECIMAL(10,2),
    "list_price" DECIMAL(10,2),
    "reference_price" DECIMAL(10,2),
    "reference_unit" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quality_flags" JSONB,
    "status" "StagingStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staging_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_health" (
    "id" SERIAL NOT NULL,
    "source_slug" TEXT NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_healthy" BOOLEAN NOT NULL,
    "response_time_ms" INTEGER NOT NULL,
    "error_type" TEXT,
    "hash_valid" BOOLEAN NOT NULL,
    "products_returned" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "source_health_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingestion_run_batch_id_idx" ON "ingestion_run"("batch_id");

-- CreateIndex
CREATE INDEX "ingestion_run_source_slug_started_at_idx" ON "ingestion_run"("source_slug", "started_at");

-- CreateIndex
CREATE INDEX "staging_product_run_id_idx" ON "staging_product"("run_id");

-- CreateIndex
CREATE INDEX "staging_product_ean_source_slug_idx" ON "staging_product"("ean", "source_slug");

-- CreateIndex
CREATE INDEX "staging_product_status_idx" ON "staging_product"("status");

-- CreateIndex
CREATE INDEX "staging_product_created_at_idx" ON "staging_product"("created_at");

-- CreateIndex
CREATE INDEX "source_health_source_slug_checked_at_idx" ON "source_health"("source_slug", "checked_at");

-- AddForeignKey
ALTER TABLE "ingestion_run" ADD CONSTRAINT "ingestion_run_supermarket_id_fkey" FOREIGN KEY ("supermarket_id") REFERENCES "supermarkets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staging_product" ADD CONSTRAINT "staging_product_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ingestion_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;