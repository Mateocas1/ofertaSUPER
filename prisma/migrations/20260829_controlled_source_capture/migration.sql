-- U6: source-only durable capture; no governed catalog access or lock is permitted here.
CREATE TABLE public.source_capture_operations (
  "id" TEXT PRIMARY KEY, "operation_key" TEXT NOT NULL UNIQUE,
  "source" TEXT NOT NULL CHECK ("source" IN ('carrefour','vea','disco','jumbo','mas')),
  "items" JSONB NOT NULL,
  "observed_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.source_capture_items (
  "operation_id" TEXT NOT NULL REFERENCES public.source_capture_operations("id") ON DELETE RESTRICT,
  "entity" TEXT NOT NULL CHECK ("entity" IN ('product','offer','history')),
  "item_key" TEXT NOT NULL, "before_facts" JSONB, "after_facts" JSONB,
  PRIMARY KEY ("operation_id", "entity", "item_key"),
  CHECK ("before_facts" IS DISTINCT FROM "after_facts")
);
CREATE FUNCTION public.capture_source_delta(p_operation_key TEXT, p_source TEXT, p_items JSONB)
RETURNS TABLE(operation_id TEXT, observed_at TIMESTAMPTZ) LANGUAGE plpgsql AS $$
DECLARE captured_id TEXT; captured_source TEXT; captured_items JSONB;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'source capture items are required'; END IF;
  SELECT operation."id", operation."source", operation."items", operation."observed_at" INTO captured_id, captured_source, captured_items, observed_at FROM public.source_capture_operations operation WHERE operation."operation_key"=p_operation_key FOR UPDATE;
  IF captured_id IS NOT NULL THEN
    IF captured_source IS DISTINCT FROM p_source OR captured_items IS DISTINCT FROM p_items THEN RAISE EXCEPTION 'source capture idempotency conflict'; END IF;
  ELSE
    captured_id := md5(clock_timestamp()::TEXT || random()::TEXT || p_operation_key);
    INSERT INTO public.source_capture_operations AS operation ("id","operation_key","source","items") VALUES (captured_id,p_operation_key,p_source,p_items) RETURNING operation."observed_at" INTO observed_at;
    INSERT INTO public.source_capture_items ("operation_id","entity","item_key","before_facts","after_facts")
    SELECT captured_id, item->>'entity', item->>'key', item->'before', item->'after' FROM jsonb_array_elements(p_items) item;
  END IF;
  operation_id := captured_id; RETURN NEXT;
END; $$;
