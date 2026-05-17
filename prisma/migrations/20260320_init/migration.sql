-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('2x1', '2nd_50', 'wallet_discount', 'bank_discount', 'percentage');

-- CreateTable
CREATE TABLE "supermarkets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "base_url" TEXT NOT NULL,
    "is_vtex" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "supermarkets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "ean" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("ean")
);

-- CreateTable
CREATE TABLE "supermarket_products" (
    "id" SERIAL NOT NULL,
    "product_ean" TEXT NOT NULL,
    "supermarket_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "list_price" DECIMAL(10,2),
    "reference_price" DECIMAL(10,2),
    "reference_unit" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sku_id" TEXT,
    "seller_id" TEXT,
    "product_url" TEXT,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supermarket_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" SERIAL NOT NULL,
    "supermarket_product_id" INTEGER NOT NULL,
    "price" DECIMAL(10,2),
    "list_price" DECIMAL(10,2),
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" SERIAL NOT NULL,
    "supermarket_id" INTEGER NOT NULL,
    "type" "PromotionType" NOT NULL,
    "title" TEXT NOT NULL,
    "wallet_provider" TEXT,
    "bank_name" TEXT,
    "discount_value" DECIMAL(10,2),
    "conditions" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_products" (
    "promotion_id" INTEGER NOT NULL,
    "product_ean" TEXT NOT NULL,

    CONSTRAINT "promotion_products_pkey" PRIMARY KEY ("promotion_id","product_ean")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" INTEGER,
    "icon" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supermarkets_slug_key" ON "supermarkets"("slug");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_brand_idx" ON "products"("brand");

-- CreateIndex
CREATE INDEX "supermarket_products_supermarket_id_idx" ON "supermarket_products"("supermarket_id");

-- CreateIndex
CREATE INDEX "supermarket_products_last_checked_at_idx" ON "supermarket_products"("last_checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "supermarket_products_product_ean_supermarket_id_key" ON "supermarket_products"("product_ean", "supermarket_id");

-- CreateIndex
CREATE INDEX "price_history_supermarket_product_id_scraped_at_idx" ON "price_history"("supermarket_product_id", "scraped_at");

-- CreateIndex
CREATE INDEX "price_history_scraped_at_idx" ON "price_history"("scraped_at");

-- CreateIndex
CREATE INDEX "promotions_supermarket_id_is_active_idx" ON "promotions"("supermarket_id", "is_active");

-- CreateIndex
CREATE INDEX "promotions_start_date_end_date_idx" ON "promotions"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "promotion_products_product_ean_idx" ON "promotion_products"("product_ean");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parent_id_idx" ON "categories"("parent_id");

-- AddForeignKey
ALTER TABLE "supermarket_products" ADD CONSTRAINT "supermarket_products_product_ean_fkey" FOREIGN KEY ("product_ean") REFERENCES "products"("ean") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supermarket_products" ADD CONSTRAINT "supermarket_products_supermarket_id_fkey" FOREIGN KEY ("supermarket_id") REFERENCES "supermarkets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_supermarket_product_id_fkey" FOREIGN KEY ("supermarket_product_id") REFERENCES "supermarket_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_supermarket_id_fkey" FOREIGN KEY ("supermarket_id") REFERENCES "supermarkets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_product_ean_fkey" FOREIGN KEY ("product_ean") REFERENCES "products"("ean") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_products" ADD CONSTRAINT "promotion_products_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

