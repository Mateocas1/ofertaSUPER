-- U4a: a single non-public baseline attempt is bounded and sealed before any authority activation.
CREATE TABLE "baseline_build_attempts" (
  "id" TEXT PRIMARY KEY,
  "epoch" BIGINT NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('BUILDING', 'FROZEN', 'ABANDONED')),
  "deadline_at" TIMESTAMPTZ NOT NULL,
  "expected_row_count" BIGINT NOT NULL CHECK ("expected_row_count" >= 0),
  "uploaded_row_count" BIGINT NOT NULL DEFAULT 0 CHECK ("uploaded_row_count" >= 0),
  "snapshot_id" TEXT,
  "root_digest" TEXT,
  "verifier_snapshot_id" TEXT,
  "verifier_root_digest" TEXT,
  UNIQUE ("id", "epoch")
);

CREATE OR REPLACE FUNCTION public.guard_governed_catalog_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('governed_catalog.procedure', true) IS DISTINCT FROM 'begin_baseline'
     AND current_setting('governed_catalog.procedure', true) IS DISTINCT FROM 'seal_baseline' THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.governed_catalog_begin_baseline(
  p_attempt_id TEXT, p_client_key TEXT, p_request_bytes TEXT, p_request_digest TEXT,
  p_expected_epoch BIGINT, p_expected_row_count BIGINT, p_deadline_at TIMESTAMPTZ
) RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE operation_id TEXT;
BEGIN
  SELECT operation."id" INTO operation_id FROM public.catalog_operations operation
  WHERE operation."action" = 'begin_baseline' AND operation."client_key" = p_client_key
    AND operation."request_bytes" = p_request_bytes AND operation."operation_request_digest" = p_request_digest
    AND EXISTS (SELECT 1 FROM public.baseline_build_attempts attempt WHERE attempt."id" = p_attempt_id
      AND attempt."epoch" = p_expected_epoch AND attempt."expected_row_count" = p_expected_row_count
      AND attempt."deadline_at" = p_deadline_at);
  IF operation_id IS NOT NULL THEN RETURN operation_id; END IF;
  PERFORM set_config('governed_catalog.procedure', 'begin_baseline', true);
  UPDATE public.governed_catalogs SET "state" = 'BUILDING', "active_build_attempt_id" = p_attempt_id
  WHERE "id" = 'catalog' AND "state" = 'EMPTY' AND "build_epoch" = p_expected_epoch;
  IF NOT FOUND THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
  INSERT INTO public.baseline_build_attempts ("id", "epoch", "status", "deadline_at", "expected_row_count")
  VALUES (p_attempt_id, p_expected_epoch, 'BUILDING', p_deadline_at, p_expected_row_count);
  operation_id := md5(clock_timestamp()::TEXT || random()::TEXT || p_client_key);
  INSERT INTO public.catalog_operations ("id", "action", "client_key", "request_bytes", "operation_request_digest")
  VALUES (operation_id, 'begin_baseline', p_client_key, p_request_bytes, p_request_digest);
  RETURN operation_id;
END; $$;

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
  IF NOT FOUND OR attempt."epoch" <> p_expected_epoch THEN RAISE EXCEPTION 'baseline build epoch is no longer active'; END IF;
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
END; $$;
