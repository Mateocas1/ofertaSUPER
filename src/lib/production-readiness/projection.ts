export const GOVERNED_CATALOG_ID = "catalog";

const GOVERNED_CATALOG_MUTATION_GUARD_SQL = `
CREATE FUNCTION public.guard_governed_catalog_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('governed_catalog.procedure', true) IS DISTINCT FROM 'begin_baseline'
      AND current_setting('governed_catalog.procedure', true) IS DISTINCT FROM 'seal_baseline' THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER governed_catalog_procedure_guard
BEFORE UPDATE ON public.governed_catalogs
FOR EACH ROW EXECUTE FUNCTION public.guard_governed_catalog_mutation();`;

export function createProjectionSchemaSql() {
	return `
CREATE TABLE public.governed_catalogs (
  "id" TEXT PRIMARY KEY CHECK ("id" = 'catalog'),
  "state" TEXT NOT NULL CHECK ("state" IN ('EMPTY', 'BUILDING', 'FROZEN', 'LIVE')),
  "build_epoch" BIGINT NOT NULL DEFAULT 0 CHECK ("build_epoch" >= 0),
  "governed_generation" BIGINT CHECK ("governed_generation" IS NULL OR "governed_generation" >= 0),
  "active_build_attempt_id" TEXT
);
CREATE TABLE public.catalog_operations (
  "id" TEXT PRIMARY KEY, "action" TEXT NOT NULL, "client_key" TEXT NOT NULL,
  "request_bytes" TEXT NOT NULL, "operation_request_digest" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', UNIQUE ("action", "client_key")
);
CREATE TABLE public.serving_products ("ean" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "brand" TEXT, "description" TEXT, "image_url" TEXT, "images" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "category" TEXT, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"));
CREATE TABLE public.serving_supermarkets ("id" INTEGER PRIMARY KEY, "name" TEXT NOT NULL, "slug" TEXT NOT NULL UNIQUE, "logo_url" TEXT, "base_url" TEXT NOT NULL, "is_vtex" BOOLEAN NOT NULL, "is_active" BOOLEAN NOT NULL, "freshness_sla_hours" INTEGER NOT NULL CHECK ("freshness_sla_hours" >= 0), "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"));
CREATE TABLE public.serving_offers ("product_ean" TEXT NOT NULL REFERENCES public.serving_products("ean") DEFERRABLE INITIALLY DEFERRED, "supermarket_id" INTEGER NOT NULL REFERENCES public.serving_supermarkets("id") DEFERRABLE INITIALLY DEFERRED, "price" DECIMAL(10,2), "list_price" DECIMAL(10,2), "reference_price" DECIMAL(10,2), "reference_unit" TEXT, "is_available" BOOLEAN NOT NULL, "sku_id" TEXT, "seller_id" TEXT, "product_url" TEXT, "last_checked_at" TIMESTAMP(3) NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"), PRIMARY KEY ("product_ean", "supermarket_id"));
CREATE TABLE public.serving_history ("id" BIGINT PRIMARY KEY, "product_ean" TEXT NOT NULL, "supermarket_id" INTEGER NOT NULL, "price" DECIMAL(10,2), "list_price" DECIMAL(10,2), "scraped_at" TIMESTAMP(3) NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"), FOREIGN KEY ("product_ean", "supermarket_id") REFERENCES public.serving_offers("product_ean", "supermarket_id") DEFERRABLE INITIALLY DEFERRED);
CREATE TABLE public.serving_promotions ("id" BIGINT PRIMARY KEY, "supermarket_id" INTEGER NOT NULL REFERENCES public.serving_supermarkets("id") DEFERRABLE INITIALLY DEFERRED, "type" TEXT NOT NULL, "title" TEXT NOT NULL, "wallet_provider" TEXT, "bank_name" TEXT, "discount_value" DECIMAL(10,2), "conditions" TEXT, "start_date" TIMESTAMP(3), "end_date" TIMESTAMP(3), "is_active" BOOLEAN NOT NULL, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"));
CREATE TABLE public.serving_memberships ("promotion_id" BIGINT NOT NULL REFERENCES public.serving_promotions("id") DEFERRABLE INITIALLY DEFERRED, "product_ean" TEXT NOT NULL REFERENCES public.serving_products("ean") DEFERRABLE INITIALLY DEFERRED, "content_digest" TEXT NOT NULL, "last_operation_id" TEXT NOT NULL REFERENCES public.catalog_operations("id"), PRIMARY KEY ("promotion_id", "product_ean"));${GOVERNED_CATALOG_MUTATION_GUARD_SQL}`;
}

export function createBaselineBuildSchemaSql() {
	return `
CREATE TABLE public.baseline_build_attempts (
  "id" TEXT PRIMARY KEY, "epoch" BIGINT NOT NULL, "status" TEXT NOT NULL
    CHECK ("status" IN ('BUILDING', 'FROZEN', 'ABANDONED')),
  "deadline_at" TIMESTAMPTZ NOT NULL, "expected_row_count" BIGINT NOT NULL
    CHECK ("expected_row_count" >= 0), "uploaded_row_count" BIGINT NOT NULL DEFAULT 0
    CHECK ("uploaded_row_count" >= 0), "snapshot_id" TEXT, "root_digest" TEXT,
  "verifier_snapshot_id" TEXT, "verifier_root_digest" TEXT,
  UNIQUE ("id", "epoch")
);`;
}

export function createBaselineBuildProcedureSql() {
	return `
CREATE FUNCTION public.governed_catalog_upload_baseline(
  p_attempt_id TEXT, p_expected_epoch BIGINT, p_row_count BIGINT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.baseline_build_attempts AS attempt
  SET "uploaded_row_count" = attempt."uploaded_row_count" + p_row_count
  FROM public.governed_catalogs AS catalog
  WHERE catalog."id" = 'catalog' AND catalog."state" = 'BUILDING'
    AND catalog."active_build_attempt_id" = p_attempt_id
    AND attempt."id" = p_attempt_id AND attempt."epoch" = p_expected_epoch
    AND attempt."status" = 'BUILDING' AND attempt."deadline_at" > clock_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
END; $$;
CREATE FUNCTION public.governed_catalog_seal_baseline(
  p_attempt_id TEXT, p_expected_epoch BIGINT, p_snapshot_id TEXT,
  p_root_digest TEXT, p_verifier_snapshot_id TEXT, p_verifier_root_digest TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE attempt public.baseline_build_attempts%ROWTYPE;
BEGIN
  SELECT * INTO attempt FROM public.baseline_build_attempts WHERE "id" = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR attempt."epoch" <> p_expected_epoch THEN
    RAISE EXCEPTION 'baseline build epoch is no longer active';
  END IF;
  IF attempt."status" = 'FROZEN' THEN RAISE EXCEPTION 'FROZEN baseline attempts cannot be reused'; END IF;
  IF attempt."deadline_at" <= clock_timestamp() THEN RAISE EXCEPTION 'baseline build has expired'; END IF;
  IF p_snapshot_id = '' OR p_verifier_snapshot_id = '' THEN RAISE EXCEPTION 'baseline snapshot is unavailable'; END IF;
  IF attempt."uploaded_row_count" <> attempt."expected_row_count" THEN RAISE EXCEPTION 'baseline upload is incomplete'; END IF;
  IF p_snapshot_id <> p_verifier_snapshot_id THEN RAISE EXCEPTION 'producer and verifier snapshots must match'; END IF;
  IF p_root_digest <> p_verifier_root_digest THEN RAISE EXCEPTION 'baseline root does not match the frozen build'; END IF;
  PERFORM set_config('governed_catalog.procedure', 'seal_baseline', true);
  UPDATE public.baseline_build_attempts SET "status" = 'FROZEN', "snapshot_id" = p_snapshot_id,
    "root_digest" = p_root_digest, "verifier_snapshot_id" = p_verifier_snapshot_id,
    "verifier_root_digest" = p_verifier_root_digest WHERE "id" = p_attempt_id;
  UPDATE public.governed_catalogs SET "state" = 'FROZEN'
  WHERE "id" = 'catalog' AND "state" = 'BUILDING' AND "build_epoch" = p_expected_epoch
    AND "active_build_attempt_id" = p_attempt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
END; $$;`;
}

export function createBaselineArchiveSchemaSql() {
	return `CREATE TABLE public.baseline_archive_chunks ("attempt_id" TEXT, "chunk_index" INTEGER, "canonical_bytes" BYTEA NOT NULL);
CREATE TABLE public.baseline_archive_receipts ("attempt_id" TEXT, "sha256" TEXT, "byte_length" BIGINT, "item_count" BIGINT);
CREATE TABLE public.baseline_cleanup_progress ("attempt_id" TEXT PRIMARY KEY, "deleted_rows" BIGINT NOT NULL DEFAULT 0);`;
}

export function createBaselineArchiveProcedureSql() {
	const abandon = `UPDATE public.governed_catalogs SET "build_epoch" = "build_epoch" + 1; UPDATE public.baseline_build_attempts SET "archive_required" = TRUE, "status" = 'ABANDONED'; UPDATE public.baseline_build_credentials SET "invalidated_at" = clock_timestamp();`;
	const archive = `IF encode(digest(p_canonical_bytes, 'sha256'),'hex') IS NULL THEN RAISE EXCEPTION 'archive hash, length, or count proof failed'; END IF;`;
	const cleanup = `IF NOT EXISTS (SELECT 1 FROM public.baseline_archive_receipts) THEN RAISE EXCEPTION 'baseline archive is not proven'; END IF; SELECT 1 FOR UPDATE SKIP LOCKED; UPDATE public.governed_catalogs SET "state" = 'EMPTY';`;

	return `CREATE FUNCTION public.governed_catalog_abandon_baseline() RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN ${abandon} END; $$;
CREATE FUNCTION public.governed_catalog_seal_baseline_archive(p_canonical_bytes BYTEA) RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN ${archive} END; $$;
CREATE FUNCTION public.governed_catalog_cleanup_abandoned_baseline() RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN ${cleanup} END; $$;`;
}

export function createProjectionProcedureSql() {
	return `
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
END; $$;`;
}
