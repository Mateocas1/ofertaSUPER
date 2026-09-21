-- U12a2-B: authenticate and durably retain one exact canonical envelope commitment without admission or public effect.
CREATE TABLE public.verifier_envelope_commitments (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  envelope_bytes BYTEA NOT NULL,
  envelope_digest TEXT NOT NULL UNIQUE CHECK (envelope_digest ~ '^sha256:[a-f0-9]{64}$'),
  authenticated_verifier TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE FUNCTION public.prevent_verifier_envelope_commitment_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.envelope_bytes IS DISTINCT FROM NEW.envelope_bytes
    OR OLD.envelope_digest IS DISTINCT FROM NEW.envelope_digest
    OR OLD.authenticated_verifier IS DISTINCT FROM NEW.authenticated_verifier
    OR OLD.admission_id IS NOT NULL OR NEW.admission_id IS NULL THEN
    RAISE EXCEPTION 'verifier envelope commitments are immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER verifier_envelope_commitment_immutable BEFORE UPDATE OR DELETE ON public.verifier_envelope_commitments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_verifier_envelope_commitment_mutation();

CREATE FUNCTION public.canonical_json_text(value JSONB) RETURNS TEXT
LANGUAGE SQL IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE pg_catalog.jsonb_typeof(value)
    WHEN 'object' THEN COALESCE((
      SELECT '{' || pg_catalog.string_agg(pg_catalog.to_jsonb(item.key)::text || ':' || public.canonical_json_text(item.value), ',' ORDER BY item.key COLLATE "C") || '}'
      FROM pg_catalog.jsonb_each(value) AS item
    ), '{}')
    WHEN 'array' THEN COALESCE((
      SELECT '[' || pg_catalog.string_agg(public.canonical_json_text(item.value), ',' ORDER BY item.ordinality) || ']'
      FROM pg_catalog.jsonb_array_elements(value) WITH ORDINALITY AS item(value, ordinality)
    ), '[]')
    ELSE value::text
  END
$$;

CREATE FUNCTION public.envelope_items_ordered(items JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  item JSONB;
  key_value JSONB;
  prior_entity TEXT;
  prior_key JSONB;
BEGIN
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(items) LOOP
    IF pg_catalog.jsonb_typeof(item->'entity') IS DISTINCT FROM 'string' OR item->>'entity' NOT IN ('product','offer','history')
      OR pg_catalog.jsonb_typeof(item->'key') IS DISTINCT FROM 'string' THEN RETURN FALSE; END IF;
    key_value := (item->>'key')::jsonb;
    IF pg_catalog.jsonb_typeof(key_value) IS DISTINCT FROM 'object' OR public.canonical_json_text(key_value) <> item->>'key'
      OR (item->>'entity' = 'product' AND (NOT key_value ?& ARRAY['ean'] OR key_value - 'ean' <> '{}'::jsonb OR key_value->>'ean' !~ '^[0-9]+$'))
      OR (item->>'entity' = 'history' AND (NOT key_value ?& ARRAY['id'] OR key_value - 'id' <> '{}'::jsonb OR key_value->>'id' !~ '^[1-9][0-9]*$'))
      OR (item->>'entity' = 'offer' AND (NOT key_value ?& ARRAY['product_ean','supermarket_id'] OR key_value - ARRAY['product_ean','supermarket_id'] <> '{}'::jsonb
        OR key_value->>'product_ean' !~ '^[0-9]+$' OR key_value->>'supermarket_id' !~ '^[1-9][0-9]*$')) THEN RETURN FALSE; END IF;
    IF prior_entity IS NOT NULL AND (prior_entity COLLATE "C" > (item->>'entity') COLLATE "C"
      OR (prior_entity = item->>'entity' AND CASE item->>'entity'
        WHEN 'product' THEN prior_key->>'ean' COLLATE "C" >= key_value->>'ean' COLLATE "C"
        WHEN 'history' THEN (prior_key->>'id')::numeric >= (key_value->>'id')::numeric
        ELSE prior_key->>'product_ean' COLLATE "C" > key_value->>'product_ean' COLLATE "C"
          OR (prior_key->>'product_ean' = key_value->>'product_ean' AND (prior_key->>'supermarket_id')::numeric >= (key_value->>'supermarket_id')::numeric)
      END)) THEN RETURN FALSE; END IF;
    prior_entity := item->>'entity'; prior_key := key_value;
  END LOOP;
  RETURN TRUE;
END
$$;

CREATE FUNCTION public.commit_promotion_ready_envelope(p_envelope_bytes BYTEA, p_envelope_digest TEXT)
RETURNS TABLE(commitment_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  payload_text TEXT;
  payload JSONB;
  expected_keys TEXT[] := ARRAY['binding','capture','evidenceDigest','items','observedAt','verifiedAt','verifier','version'];
  item_index INTEGER;
  capture_item JSONB;
  governed_item JSONB;
  key_value JSONB;
  expected_fields JSONB;
  expected_after JSONB;
BEGIN
  IF session_user::text <> 'ofertasuper_verifier' THEN
    RAISE EXCEPTION 'authenticated verifier session required';
  END IF;
  IF p_envelope_bytes IS NULL OR pg_catalog.octet_length(p_envelope_bytes) = 0
    OR pg_catalog.octet_length(p_envelope_bytes) > 1048576
    OR p_envelope_digest !~ '^sha256:[a-f0-9]{64}$'
    OR p_envelope_digest <> 'sha256:' || pg_catalog.encode(pg_catalog.sha256(p_envelope_bytes), 'hex') THEN
    RAISE EXCEPTION 'envelope byte or digest mismatch';
  END IF;

  payload_text := pg_catalog.convert_from(p_envelope_bytes, 'UTF8');
  payload := payload_text::jsonb;
  IF payload_text <> public.canonical_json_text(payload)
    OR NOT payload ?& expected_keys OR payload - expected_keys <> '{}'::jsonb
    OR payload->>'version' <> 'promotion-ready-envelope/v1'
    OR pg_catalog.jsonb_typeof(payload->'items') <> 'array'
    OR pg_catalog.jsonb_array_length(payload->'items') = 0
    OR payload->>'evidenceDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR NOT (payload->'verifier' ?& ARRAY['credential','resultDigest','snapshot']) OR (payload->'verifier') - ARRAY['credential','resultDigest','snapshot'] <> '{}'::jsonb
    OR payload->'verifier'->>'credential' <> 'verifier/read-only' OR payload->'verifier'->>'snapshot' !~ '^committed:.+'
    OR payload->'verifier'->>'resultDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR NOT (payload->'binding' ?& ARRAY['buildDigest','candidateDigest','deltaDigest','healthVersion','incarnation','policyDigest','predecessorGeneration','predecessorLineage'])
    OR (payload->'binding') - ARRAY['buildDigest','candidateDigest','deltaDigest','healthVersion','incarnation','policyDigest','predecessorGeneration','predecessorLineage'] <> '{}'::jsonb
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each_text(payload->'binding') item WHERE (item.key LIKE '%Digest' OR item.key LIKE '%Lineage') AND item.value !~ '^sha256:[a-f0-9]{64}$')
    OR payload->'binding'->>'candidateDigest' !~ '^sha256:[a-f0-9]{64}$' OR payload->'binding'->>'deltaDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR payload->'binding'->>'policyDigest' !~ '^sha256:[a-f0-9]{64}$' OR payload->'binding'->>'buildDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR payload->'binding'->>'predecessorLineage' !~ '^sha256:[a-f0-9]{64}$'
    OR payload->'binding'->>'incarnation' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR payload->'binding'->>'healthVersion' !~ '^(0|[1-9][0-9]*)$' OR payload->'binding'->>'predecessorGeneration' !~ '^(0|[1-9][0-9]*)$'
    OR NOT (payload->'capture' ?& ARRAY['items','observedAt','operationKey','source']) OR (payload->'capture') - ARRAY['items','observedAt','operationKey','source'] <> '{}'::jsonb
    OR payload->'capture'->>'operationKey' !~ '^source-capture/v1:sha256:[a-f0-9]{64}$'
    OR pg_catalog.jsonb_typeof(payload->'capture'->'items') <> 'array'
    OR pg_catalog.jsonb_array_length(payload->'capture'->'items') <> pg_catalog.jsonb_array_length(payload->'items')
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(payload->'capture'->'items') item WHERE NOT (item ?& ARRAY['after','before','entity','key']) OR item - ARRAY['after','before','entity','key'] <> '{}'::jsonb)
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(payload->'items') item WHERE NOT (item ?& ARRAY['after','before','entity','fields','key','tombstone']) OR item - ARRAY['after','before','entity','fields','key','tombstone'] <> '{}'::jsonb) THEN
    RAISE EXCEPTION 'canonical promotion-ready envelope required';
  END IF;
  IF pg_catalog.jsonb_typeof(payload->'observedAt') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(payload->'verifiedAt') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(payload->'capture'->'observedAt') IS DISTINCT FROM 'string'
    OR payload->>'observedAt' <> payload->'capture'->>'observedAt'
    OR payload->>'observedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR pg_catalog.to_char((payload->>'observedAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> payload->>'observedAt'
    OR payload->>'verifiedAt' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR pg_catalog.to_char((payload->>'verifiedAt')::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> payload->>'verifiedAt'
    OR (payload->>'verifiedAt')::timestamptz < (payload->>'observedAt')::timestamptz THEN
    RAISE EXCEPTION 'root/capture timestamp mismatch';
  END IF;
  IF pg_catalog.jsonb_typeof(payload->'capture'->'source') IS DISTINCT FROM 'string'
    OR payload->'capture'->>'source' NOT IN ('carrefour','vea','disco','jumbo','mas') THEN
    RAISE EXCEPTION 'capture source semantics invalid';
  END IF;
  IF NOT public.envelope_items_ordered(payload->'capture'->'items') THEN RAISE EXCEPTION 'capture item ordering invalid'; END IF;
  IF NOT public.envelope_items_ordered(payload->'items') THEN RAISE EXCEPTION 'governed item ordering invalid'; END IF;

  FOR item_index IN 0..pg_catalog.jsonb_array_length(payload->'items') - 1 LOOP
    capture_item := payload->'capture'->'items'->item_index;
    governed_item := payload->'items'->item_index;
    key_value := (governed_item->>'key')::jsonb;
    IF capture_item->'entity' <> governed_item->'entity' OR capture_item->'key' <> governed_item->'key'
      OR pg_catalog.jsonb_typeof(capture_item->'before') NOT IN ('object','null') OR pg_catalog.jsonb_typeof(capture_item->'after') NOT IN ('object','null')
      OR pg_catalog.jsonb_typeof(governed_item->'before') NOT IN ('object','null') OR pg_catalog.jsonb_typeof(governed_item->'after') NOT IN ('object','null')
      OR pg_catalog.jsonb_typeof(governed_item->'fields') <> 'array' OR pg_catalog.jsonb_array_length(governed_item->'fields') = 0
      OR pg_catalog.jsonb_typeof(governed_item->'tombstone') <> 'boolean'
      OR governed_item->'tombstone' IS DISTINCT FROM pg_catalog.to_jsonb(governed_item->'after' = 'null'::jsonb)
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(governed_item->'fields') WITH ORDINALITY f(value, n)
        WHERE f.value = '' OR f.n > 1 AND f.value COLLATE "C" <= governed_item->'fields'->>(f.n::integer - 2))
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(key_value) k
        WHERE governed_item->'before' <> 'null'::jsonb AND governed_item->'before'->k.key IS DISTINCT FROM k.value
          OR governed_item->'after' <> 'null'::jsonb AND governed_item->'after'->k.key IS DISTINCT FROM k.value) THEN
      RAISE EXCEPTION 'governed item semantics invalid';
    END IF;
    IF capture_item->'before' = 'null'::jsonb THEN
      expected_fields := (SELECT pg_catalog.jsonb_agg(key ORDER BY key COLLATE "C") FROM pg_catalog.jsonb_object_keys(capture_item->'after') key);
      expected_after := capture_item->'after';
      IF governed_item->'before' <> 'null'::jsonb THEN RAISE EXCEPTION 'governed item semantics invalid'; END IF;
    ELSIF capture_item->'after' = 'null'::jsonb THEN
      expected_fields := (SELECT pg_catalog.jsonb_agg(key ORDER BY key COLLATE "C") FROM pg_catalog.jsonb_object_keys(capture_item->'before') key);
      expected_after := 'null'::jsonb;
      IF governed_item->'before' <> capture_item->'before' THEN RAISE EXCEPTION 'governed item semantics invalid'; END IF;
    ELSE
      IF (SELECT pg_catalog.jsonb_agg(key ORDER BY key COLLATE "C") FROM pg_catalog.jsonb_object_keys(capture_item->'before') key)
        <> (SELECT pg_catalog.jsonb_agg(key ORDER BY key COLLATE "C") FROM pg_catalog.jsonb_object_keys(capture_item->'after') key) THEN RAISE EXCEPTION 'governed item semantics invalid'; END IF;
      expected_fields := (SELECT pg_catalog.jsonb_agg(key ORDER BY key COLLATE "C") FROM pg_catalog.jsonb_object_keys(capture_item->'after') key
        WHERE capture_item->'before'->key IS DISTINCT FROM capture_item->'after'->key);
      expected_after := governed_item->'before' || (SELECT pg_catalog.jsonb_object_agg(key, capture_item->'after'->key)
        FROM pg_catalog.jsonb_array_elements_text(expected_fields) key);
      IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements_text(expected_fields) key
        WHERE governed_item->'before'->key IS DISTINCT FROM capture_item->'before'->key) THEN RAISE EXCEPTION 'governed item semantics invalid'; END IF;
    END IF;
    IF governed_item->'fields' IS DISTINCT FROM expected_fields OR governed_item->'after' IS DISTINCT FROM expected_after THEN
      RAISE EXCEPTION 'governed item semantics invalid';
    END IF;
  END LOOP;

  INSERT INTO public.verifier_envelope_commitments (envelope_bytes, envelope_digest, authenticated_verifier)
    VALUES (p_envelope_bytes, p_envelope_digest, session_user::text)
    ON CONFLICT (envelope_digest) DO NOTHING;
  RETURN QUERY SELECT id FROM public.verifier_envelope_commitments
    WHERE envelope_digest = p_envelope_digest AND authenticated_verifier = session_user::text;
  IF NOT FOUND THEN RAISE EXCEPTION 'verifier commitment conflict'; END IF;
END
$$;

ALTER TABLE public.verifier_envelope_commitments OWNER TO ofertasuper_verifier_definer;
ALTER FUNCTION public.prevent_verifier_envelope_commitment_mutation() OWNER TO ofertasuper_verifier_definer;
ALTER FUNCTION public.canonical_json_text(jsonb) OWNER TO ofertasuper_verifier_definer;
ALTER FUNCTION public.envelope_items_ordered(jsonb) OWNER TO ofertasuper_verifier_definer;
ALTER FUNCTION public.commit_promotion_ready_envelope(bytea, text) OWNER TO ofertasuper_verifier_definer;
REVOKE ALL ON TABLE public.verifier_envelope_commitments FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
REVOKE EXECUTE ON FUNCTION public.prevent_verifier_envelope_commitment_mutation() FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
REVOKE EXECUTE ON FUNCTION public.canonical_json_text(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.envelope_items_ordered(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.commit_promotion_ready_envelope(bytea, text) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime;
GRANT EXECUTE ON FUNCTION public.commit_promotion_ready_envelope(bytea, text) TO ofertasuper_verifier;
