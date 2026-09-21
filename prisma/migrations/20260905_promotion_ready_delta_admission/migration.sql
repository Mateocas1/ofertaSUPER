-- U12a2-C: durably admit one authenticated U12a2-B commitment without caller-replayed payload bytes.
CREATE TABLE public.promotion_ready_envelope_admissions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  commitment_id UUID NOT NULL UNIQUE REFERENCES public.verifier_envelope_commitments(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL UNIQUE,
  request_digest TEXT NOT NULL UNIQUE CHECK (request_digest ~ '^sha256:[a-f0-9]{64}$'),
  envelope_bytes BYTEA NOT NULL,
  envelope_digest TEXT NOT NULL UNIQUE CHECK (envelope_digest ~ '^sha256:[a-f0-9]{64}$'),
  payload JSONB NOT NULL,
  candidate_digest TEXT NOT NULL, delta_digest TEXT NOT NULL, incarnation UUID NOT NULL,
  policy_digest TEXT NOT NULL, build_digest TEXT NOT NULL, health_version BIGINT NOT NULL,
  predecessor_generation BIGINT NOT NULL, predecessor_lineage TEXT NOT NULL,
  evidence_digest TEXT NOT NULL, observed_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL,
  authenticated_verifier TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CHECK (health_version >= 0 AND predecessor_generation >= 0)
);
ALTER TABLE public.verifier_envelope_commitments
  ADD COLUMN admission_id UUID UNIQUE REFERENCES public.promotion_ready_envelope_admissions(id) ON DELETE RESTRICT;

CREATE TABLE public.promotion_ready_envelope_items (
  admission_id UUID NOT NULL REFERENCES public.promotion_ready_envelope_admissions(id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0), entity TEXT NOT NULL, item_key TEXT NOT NULL,
  before_image JSONB NOT NULL, after_image JSONB NOT NULL, fields JSONB NOT NULL, tombstone BOOLEAN NOT NULL,
  PRIMARY KEY (admission_id, ordinal), UNIQUE (admission_id, entity, item_key)
);

CREATE FUNCTION public.admit_promotion_ready_envelopes(p_request JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_request_key TEXT; request_digest TEXT; commitment_id UUID;
  commitment public.verifier_envelope_commitments%ROWTYPE;
  admission public.promotion_ready_envelope_admissions%ROWTYPE;
  payload JSONB;
BEGIN
  IF session_user::text <> 'ofertasuper_verifier' THEN RAISE EXCEPTION 'authenticated verifier session required'; END IF;
  IF p_request IS NULL OR NOT p_request ?& ARRAY['commitmentId','requestKey']
    OR p_request - ARRAY['commitmentId','requestKey'] <> '{}'::jsonb
    OR pg_catalog.jsonb_typeof(p_request->'commitmentId') <> 'string'
    OR pg_catalog.jsonb_typeof(p_request->'requestKey') <> 'string'
    OR pg_catalog.length(p_request->>'requestKey') NOT BETWEEN 1 AND 256
    OR p_request->>'requestKey' !~ '^[a-zA-Z0-9:_-]+$' THEN
    RAISE EXCEPTION 'canonical admission reference required';
  END IF;
  v_request_key := p_request->>'requestKey';
  commitment_id := (p_request->>'commitmentId')::uuid;
  IF commitment_id::text <> p_request->>'commitmentId' THEN RAISE EXCEPTION 'canonical admission reference required'; END IF;
  request_digest := 'sha256:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(public.canonical_json_text(p_request), 'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_request_key, 0));

  SELECT * INTO admission FROM public.promotion_ready_envelope_admissions a WHERE a.request_key = v_request_key FOR UPDATE;
  IF FOUND THEN
    IF admission.request_digest <> request_digest THEN RAISE EXCEPTION 'request digest conflict'; END IF;
    RETURN pg_catalog.jsonb_build_object('admissionId', admission.id, 'envelopeDigest', admission.envelope_digest, 'requestDigest', admission.request_digest);
  END IF;

  SELECT * INTO commitment FROM public.verifier_envelope_commitments WHERE id = commitment_id FOR UPDATE;
  IF NOT FOUND OR commitment.authenticated_verifier <> session_user::text THEN RAISE EXCEPTION 'verifier commitment required'; END IF;
  IF commitment.admission_id IS NOT NULL THEN
    SELECT * INTO admission FROM public.promotion_ready_envelope_admissions WHERE id = commitment.admission_id;
    IF admission.request_digest <> request_digest THEN RAISE EXCEPTION 'request digest conflict'; END IF;
    RETURN pg_catalog.jsonb_build_object('admissionId', admission.id, 'envelopeDigest', admission.envelope_digest, 'requestDigest', admission.request_digest);
  END IF;

  payload := pg_catalog.convert_from(commitment.envelope_bytes, 'UTF8')::jsonb;
  IF NOT EXISTS (
    SELECT 1 FROM public.authority_candidates c
    JOIN public.refresh_policies p ON p.id = c.policy_id
    JOIN public.governed_catalogs g ON g.id = 'catalog'
    JOIN public.candidate_technical_verifications tv ON tv.id = g.authority_adoption->>'verificationId' AND tv.candidate_id = c.id
    JOIN public.delta_verifications v ON v.result_digest = payload->'verifier'->>'resultDigest'
    JOIN public.source_capture_operations s ON s.id = v.source_operation_id
    JOIN public.evidence_artifacts e ON e.id = v.evidence_artifact_id
    WHERE c.manifest_digest = payload->'binding'->>'candidateDigest' AND p.digest = payload->'binding'->>'policyDigest'
      AND c.valid_from <= clock_timestamp() AND c.expires_at > clock_timestamp()
      AND tv.result = 'PASS' AND tv.revoked_at IS NULL AND tv.deadline_at > clock_timestamp()
      AND g.state = 'LIVE' AND g.authority_adoption->>'incarnation' = payload->'binding'->>'incarnation'
      AND g.authority_adoption->>'policyDigest' = p.digest AND g.authority_adoption->>'buildDigest' = payload->'binding'->>'buildDigest'
      AND g.authority_adoption->>'healthVersion' = payload->'binding'->>'healthVersion'
      AND g.governed_generation::text = payload->'binding'->>'predecessorGeneration'
      AND g.authority_adoption->>'lineage' = payload->'binding'->>'predecessorLineage'
      AND v.status = 'SEALED_SOURCE_ONLY' AND v.verifier_credential = 'verifier/read-only'
      AND v.committed_snapshot = payload->'verifier'->>'snapshot'
      AND v.policy_digest = p.digest AND v.predecessor_digest = payload->'binding'->>'predecessorLineage'
      AND e.sha256 = payload->>'evidenceDigest' AND e.integrity_status = 'CLEAR' AND e.retain_until > clock_timestamp()
      AND v.observed_at = (payload->>'observedAt')::timestamptz AND v.verified_at = (payload->>'verifiedAt')::timestamptz
      AND s.operation_key = payload->'capture'->>'operationKey' AND s.source = payload->'capture'->>'source'
      AND s.items = payload->'capture'->'items' AND s.observed_at = (payload->'capture'->>'observedAt')::timestamptz
  ) THEN RAISE EXCEPTION 'stale commitment binding'; END IF;
  INSERT INTO public.promotion_ready_envelope_admissions (
    commitment_id, request_key, request_digest, envelope_bytes, envelope_digest, payload, candidate_digest, delta_digest, incarnation,
    policy_digest, build_digest, health_version, predecessor_generation, predecessor_lineage, evidence_digest,
    observed_at, verified_at, authenticated_verifier
  ) VALUES (
    commitment.id, v_request_key, request_digest, commitment.envelope_bytes, commitment.envelope_digest, payload,
    payload->'binding'->>'candidateDigest', payload->'binding'->>'deltaDigest', (payload->'binding'->>'incarnation')::uuid,
    payload->'binding'->>'policyDigest', payload->'binding'->>'buildDigest', (payload->'binding'->>'healthVersion')::bigint,
    (payload->'binding'->>'predecessorGeneration')::bigint, payload->'binding'->>'predecessorLineage', payload->>'evidenceDigest',
    (payload->>'observedAt')::timestamptz, (payload->>'verifiedAt')::timestamptz, commitment.authenticated_verifier
  ) RETURNING * INTO admission;
  INSERT INTO public.promotion_ready_envelope_items (admission_id, ordinal, entity, item_key, before_image, after_image, fields, tombstone)
    SELECT admission.id, item.ordinality - 1, item.value->>'entity', item.value->>'key',
      COALESCE(item.value->'before', 'null'::jsonb), COALESCE(item.value->'after', 'null'::jsonb), item.value->'fields', (item.value->>'tombstone')::boolean
    FROM pg_catalog.jsonb_array_elements(payload->'items') WITH ORDINALITY AS item(value, ordinality);
  UPDATE public.verifier_envelope_commitments SET admission_id = admission.id WHERE id = commitment.id;
  RETURN pg_catalog.jsonb_build_object('admissionId', admission.id, 'envelopeDigest', admission.envelope_digest, 'requestDigest', admission.request_digest);
END $$;

CREATE FUNCTION public.prevent_promotion_ready_admission_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN RAISE EXCEPTION 'promotion-ready admission seals are immutable'; END $$;
CREATE TRIGGER promotion_ready_admission_immutable BEFORE UPDATE OR DELETE ON public.promotion_ready_envelope_admissions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_promotion_ready_admission_mutation();
CREATE TRIGGER promotion_ready_item_immutable BEFORE UPDATE OR DELETE ON public.promotion_ready_envelope_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_promotion_ready_admission_mutation();

ALTER TABLE public.promotion_ready_envelope_admissions OWNER TO ofertasuper_verifier_definer;
ALTER TABLE public.promotion_ready_envelope_items OWNER TO ofertasuper_verifier_definer;
ALTER FUNCTION public.admit_promotion_ready_envelopes(jsonb) OWNER TO ofertasuper_verifier_definer;
GRANT SELECT ON TABLE public.authority_candidates, public.refresh_policies, public.governed_catalogs, public.candidate_technical_verifications, public.delta_verifications, public.source_capture_operations, public.evidence_artifacts TO ofertasuper_verifier_definer;
REVOKE ALL ON TABLE public.promotion_ready_envelope_admissions, public.promotion_ready_envelope_items FROM PUBLIC, ofertasuper_app, ofertasuper_runtime, ofertasuper_verifier;
REVOKE EXECUTE ON FUNCTION public.admit_promotion_ready_envelopes(jsonb) FROM PUBLIC, ofertasuper_app, ofertasuper_runtime;
GRANT EXECUTE ON FUNCTION public.admit_promotion_ready_envelopes(jsonb) TO ofertasuper_verifier;
