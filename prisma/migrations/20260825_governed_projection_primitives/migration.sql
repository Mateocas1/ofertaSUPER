-- U1: additive public-schema primitives only. Privileges, build lifecycle, and activation remain later units.
CREATE TABLE "governed_catalogs" (
  "id" TEXT NOT NULL CHECK ("id" = 'catalog'),
  "state" TEXT NOT NULL CHECK ("state" IN ('EMPTY', 'BUILDING', 'FROZEN', 'LIVE')),
  "build_epoch" BIGINT NOT NULL DEFAULT 0 CHECK ("build_epoch" >= 0),
  "governed_generation" BIGINT CHECK ("governed_generation" IS NULL OR "governed_generation" >= 0),
  "active_build_attempt_id" TEXT,
  CONSTRAINT "governed_catalogs_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "catalog_operations" (
  "id" TEXT NOT NULL, "action" TEXT NOT NULL, "client_key" TEXT NOT NULL, "request_bytes" TEXT NOT NULL,
  "operation_request_digest" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "catalog_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_operations_action_client_key_key" UNIQUE ("action", "client_key")
);
CREATE TABLE "serving_products" ("ean" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "brand" TEXT, "description" TEXT, "image_url" TEXT, "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "category" TEXT, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"));
CREATE TABLE "serving_supermarkets" ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL UNIQUE, "logo_url" TEXT, "base_url" TEXT NOT NULL, "is_vtex" BOOLEAN NOT NULL, "is_active" BOOLEAN NOT NULL, "freshness_sla_hours" INTEGER NOT NULL CHECK ("freshness_sla_hours" >= 0), "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"));
CREATE TABLE "serving_offers" ("product_ean" TEXT NOT NULL REFERENCES "serving_products"("ean") DEFERRABLE INITIALLY DEFERRED, "supermarket_id" INTEGER NOT NULL REFERENCES "serving_supermarkets"("id") DEFERRABLE INITIALLY DEFERRED, "price" DECIMAL(10,2), "list_price" DECIMAL(10,2), "reference_price" DECIMAL(10,2), "reference_unit" TEXT, "is_available" BOOLEAN NOT NULL, "sku_id" TEXT, "seller_id" TEXT, "product_url" TEXT, "last_checked_at" TIMESTAMP(3) NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"), PRIMARY KEY ("product_ean", "supermarket_id"));
CREATE TABLE "serving_history" ("id" BIGINT PRIMARY KEY, "product_ean" TEXT NOT NULL, "supermarket_id" INTEGER NOT NULL, "price" DECIMAL(10,2), "list_price" DECIMAL(10,2), "scraped_at" TIMESTAMP(3) NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"), FOREIGN KEY ("product_ean", "supermarket_id") REFERENCES "serving_offers"("product_ean", "supermarket_id") DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE "serving_promotions" ("id" BIGINT PRIMARY KEY, "supermarket_id" INTEGER NOT NULL REFERENCES "serving_supermarkets"("id") DEFERRABLE INITIALLY DEFERRED, "type" TEXT NOT NULL, "title" TEXT NOT NULL, "wallet_provider" TEXT, "bank_name" TEXT, "discount_value" DECIMAL(10,2), "conditions" TEXT, "start_date" TIMESTAMP(3), "end_date" TIMESTAMP(3), "is_active" BOOLEAN NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"));
CREATE TABLE "serving_memberships" ("promotion_id" BIGINT NOT NULL REFERENCES "serving_promotions"("id") DEFERRABLE INITIALLY DEFERRED, "product_ean" TEXT NOT NULL REFERENCES "serving_products"("ean") DEFERRABLE INITIALLY DEFERRED, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES "catalog_operations"("id"), PRIMARY KEY ("promotion_id", "product_ean"));

CREATE FUNCTION public.guard_governed_catalog_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('governed_catalog.procedure', true) IS DISTINCT FROM 'begin_baseline' THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER governed_catalog_procedure_guard
BEFORE UPDATE ON public.governed_catalogs
FOR EACH ROW EXECUTE FUNCTION public.guard_governed_catalog_mutation();

CREATE FUNCTION public.governed_catalog_begin_baseline(p_client_key TEXT, p_request_bytes TEXT, p_request_digest TEXT, p_expected_epoch BIGINT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  operation_id TEXT;
  existing_request_bytes TEXT;
  existing_request_digest TEXT;
BEGIN
  SELECT "id", "request_bytes", "operation_request_digest"
  INTO operation_id, existing_request_bytes, existing_request_digest
  FROM public.catalog_operations
  WHERE "action" = 'begin_baseline' AND "client_key" = p_client_key
  FOR UPDATE;
  IF operation_id IS NOT NULL THEN
    IF existing_request_bytes <> p_request_bytes OR existing_request_digest <> p_request_digest THEN
      RAISE EXCEPTION 'operation request conflicts with an existing client key';
    END IF;
    RETURN operation_id;
  END IF;
  PERFORM set_config('governed_catalog.procedure', 'begin_baseline', true);
  UPDATE public.governed_catalogs SET "state" = 'BUILDING' WHERE "id" = 'catalog' AND "state" = 'EMPTY' AND "build_epoch" = p_expected_epoch;
  IF NOT FOUND THEN RAISE EXCEPTION 'governed catalog is not available for this build epoch'; END IF;
  operation_id := md5(clock_timestamp()::TEXT || random()::TEXT || p_client_key);
  INSERT INTO public.catalog_operations ("id", "action", "client_key", "request_bytes", "operation_request_digest") VALUES (operation_id, 'begin_baseline', p_client_key, p_request_bytes, p_request_digest);
  RETURN operation_id;
END; $$;
