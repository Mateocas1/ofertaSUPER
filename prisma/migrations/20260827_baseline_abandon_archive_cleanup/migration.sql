-- U4b: abandoned attempts retain exact attempted bytes before bounded, resumable cleanup.
ALTER TABLE public.governed_catalogs ADD COLUMN "cleanup_attempt_id" TEXT;
ALTER TABLE public.baseline_build_attempts ADD COLUMN "archive_required" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE public.baseline_archive_chunks (
  "attempt_id" TEXT NOT NULL REFERENCES public.baseline_build_attempts("id") ON DELETE RESTRICT,
  "chunk_index" INTEGER NOT NULL CHECK ("chunk_index" >= 0), "canonical_bytes" BYTEA NOT NULL,
  "sha256" TEXT NOT NULL, "item_count" BIGINT NOT NULL CHECK ("item_count" >= 0),
  CHECK (octet_length("canonical_bytes") <= 1048576), PRIMARY KEY ("attempt_id", "chunk_index")
);
CREATE TABLE public.baseline_archive_receipts (
  "attempt_id" TEXT PRIMARY KEY REFERENCES public.baseline_build_attempts("id") ON DELETE RESTRICT,
  "sha256" TEXT NOT NULL, "byte_length" BIGINT NOT NULL, "item_count" BIGINT NOT NULL,
  "sealed_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.baseline_build_credentials (
  "attempt_id" TEXT NOT NULL REFERENCES public.baseline_build_attempts("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('SEAL', 'CHALLENGE', 'APPROVAL')), "invalidated_at" TIMESTAMPTZ,
  PRIMARY KEY ("attempt_id", "kind")
);
CREATE TABLE public.baseline_cleanup_rows (
  "attempt_id" TEXT NOT NULL REFERENCES public.baseline_build_attempts("id") ON DELETE RESTRICT,
  "id" TEXT NOT NULL, "parent_id" TEXT, PRIMARY KEY ("attempt_id", "id"),
  FOREIGN KEY ("attempt_id", "parent_id") REFERENCES public.baseline_cleanup_rows("attempt_id", "id") DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE public.baseline_cleanup_progress ("attempt_id" TEXT PRIMARY KEY REFERENCES public.baseline_build_attempts("id") ON DELETE RESTRICT, "deleted_rows" BIGINT NOT NULL DEFAULT 0);

CREATE OR REPLACE FUNCTION public.guard_governed_catalog_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('governed_catalog.procedure', true) NOT IN ('begin_baseline', 'seal_baseline', 'abandon_baseline', 'cleanup_baseline') THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF; RETURN NEW;
END; $$;
CREATE FUNCTION public.governed_catalog_abandon_baseline(p_attempt_id TEXT, p_expected_epoch BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('governed_catalog.procedure', 'abandon_baseline', true);
  UPDATE public.governed_catalogs SET "build_epoch" = "build_epoch" + 1, "cleanup_attempt_id" = p_attempt_id
  WHERE "id" = 'catalog' AND "state" IN ('BUILDING', 'FROZEN') AND "active_build_attempt_id" = p_attempt_id AND "build_epoch" = p_expected_epoch;
  IF NOT FOUND THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
  UPDATE public.baseline_build_attempts SET "status" = 'ABANDONED', "archive_required" = TRUE WHERE "id" = p_attempt_id AND "epoch" = p_expected_epoch;
  UPDATE public.baseline_build_credentials SET "invalidated_at" = clock_timestamp() WHERE "attempt_id" = p_attempt_id AND "invalidated_at" IS NULL;
  INSERT INTO public.baseline_cleanup_progress ("attempt_id") VALUES (p_attempt_id);
END; $$;
CREATE FUNCTION public.governed_catalog_archive_baseline_chunk(p_attempt_id TEXT, p_expected_epoch BIGINT, p_index INTEGER, p_bytes BYTEA, p_count BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.baseline_build_attempts WHERE "id"=p_attempt_id AND "epoch"=p_expected_epoch AND "status"='ABANDONED') THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
  INSERT INTO public.baseline_archive_chunks VALUES (p_attempt_id,p_index,p_bytes,encode(sha256(p_bytes),'hex'),p_count);
END; $$;
CREATE FUNCTION public.governed_catalog_seal_baseline_archive(p_attempt_id TEXT, p_expected_epoch BIGINT, p_canonical_bytes BYTEA, p_sha256 TEXT, p_length BIGINT, p_count BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE actual BYTEA; actual_length BIGINT; actual_count BIGINT;
BEGIN
  SELECT decode(string_agg(encode("canonical_bytes",'hex'),'' ORDER BY "chunk_index"),'hex'), coalesce(sum(octet_length("canonical_bytes")),0), coalesce(sum("item_count"),0) INTO actual,actual_length,actual_count FROM public.baseline_archive_chunks WHERE "attempt_id"=p_attempt_id;
  IF NOT EXISTS (SELECT 1 FROM public.baseline_build_attempts WHERE "id"=p_attempt_id AND "epoch"=p_expected_epoch AND "status"='ABANDONED' AND "archive_required") OR actual IS DISTINCT FROM p_canonical_bytes OR encode(sha256(p_canonical_bytes),'hex') <> p_sha256 OR actual_length <> p_length OR actual_count <> p_count THEN RAISE EXCEPTION 'archive hash, length, or count proof failed'; END IF;
  INSERT INTO public.baseline_archive_receipts ("attempt_id","sha256","byte_length","item_count") VALUES (p_attempt_id,p_sha256,p_length,p_count);
END; $$;
CREATE FUNCTION public.governed_catalog_cleanup_abandoned_baseline(p_attempt_id TEXT, p_expected_epoch BIGINT, p_limit INTEGER) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE deleted_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.governed_catalogs c JOIN public.baseline_archive_receipts r ON r."attempt_id"=p_attempt_id WHERE c."id"='catalog' AND c."cleanup_attempt_id"=p_attempt_id AND c."build_epoch"=p_expected_epoch+1) THEN RAISE EXCEPTION 'baseline archive is not proven'; END IF;
  WITH chosen AS (SELECT r.ctid FROM public.baseline_cleanup_rows r WHERE r."attempt_id"=p_attempt_id AND NOT EXISTS (SELECT 1 FROM public.baseline_cleanup_rows child WHERE child."attempt_id"=r."attempt_id" AND child."parent_id"=r."id") FOR UPDATE SKIP LOCKED LIMIT p_limit) DELETE FROM public.baseline_cleanup_rows r USING chosen WHERE r.ctid=chosen.ctid; GET DIAGNOSTICS deleted_count = ROW_COUNT;
  UPDATE public.baseline_cleanup_progress SET "deleted_rows" = "deleted_rows" + deleted_count WHERE "attempt_id" = p_attempt_id;
  IF NOT EXISTS (SELECT 1 FROM public.baseline_cleanup_rows WHERE "attempt_id"=p_attempt_id) THEN
    DELETE FROM public.serving_memberships; DELETE FROM public.serving_history; DELETE FROM public.serving_offers;
    DELETE FROM public.serving_promotions; DELETE FROM public.serving_supermarkets; DELETE FROM public.serving_products;
    PERFORM set_config('governed_catalog.procedure', 'cleanup_baseline', true);
    UPDATE public.governed_catalogs SET "state" = 'EMPTY', "active_build_attempt_id" = NULL, "cleanup_attempt_id" = NULL WHERE "id"='catalog' AND "cleanup_attempt_id"=p_attempt_id;
  END IF;
  RETURN deleted_count;
END; $$;
