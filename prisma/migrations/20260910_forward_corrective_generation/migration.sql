-- U14b: corrections are new generations, immutably linked to the bad generation and fresh admission.
CREATE TABLE public.forward_corrective_generation_links (
  admission_id UUID PRIMARY KEY REFERENCES public.promotion_ready_envelope_admissions(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL UNIQUE,
  bad_operation_id UUID NOT NULL REFERENCES public.generation_promotion_operations(id) ON DELETE RESTRICT,
  bad_generation_record_id UUID NOT NULL REFERENCES public.governed_generation_records(id) ON DELETE RESTRICT,
  predecessor_generation BIGINT NOT NULL CHECK (predecessor_generation >= 0),
  predecessor_lineage TEXT NOT NULL CHECK (predecessor_lineage ~ '^sha256:[a-f0-9]{64}$'),
  envelope_digest TEXT NOT NULL CHECK (envelope_digest ~ '^sha256:[a-f0-9]{64}$'),
  audit_digest TEXT NOT NULL CHECK (audit_digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
CREATE FUNCTION public.prevent_forward_corrective_generation_link_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN RAISE EXCEPTION 'forward correction linkage is immutable'; END $$;
CREATE TRIGGER forward_corrective_generation_links_immutable BEFORE UPDATE OR DELETE ON public.forward_corrective_generation_links
FOR EACH ROW EXECUTE FUNCTION public.prevent_forward_corrective_generation_link_mutation();

-- This admission-only guard never publishes. Ambiguous correction boundaries retain the coarse catalog restriction.
CREATE FUNCTION public.link_forward_correction(r JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  admission public.promotion_ready_envelope_admissions%ROWTYPE; bad_operation public.generation_promotion_operations%ROWTYPE;
  bad_record public.governed_generation_records%ROWTYPE; catalog public.governed_catalogs%ROWTYPE;
  prior public.forward_corrective_generation_links%ROWTYPE; digest TEXT;
  keys TEXT[] := ARRAY['key','admissionId','envelopeDigest','badOperationId','badGenerationRecordId','expectedGeneration','expectedLineage'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT coalesce(r ?& keys,false) OR r - keys <> '{}'::jsonb OR octet_length(r::text)>8192
    OR length(r->>'key') NOT BETWEEN 1 AND 256 OR r->>'key' !~ '^[a-zA-Z0-9:_-]+$'
    OR r->>'admissionId' !~ '^[0-9a-f-]{36}$' OR r->>'badOperationId' !~ '^[0-9a-f-]{36}$' OR r->>'badGenerationRecordId' !~ '^[0-9a-f-]{36}$'
    OR r->>'envelopeDigest' !~ '^sha256:[a-f0-9]{64}$' OR r->>'expectedGeneration' !~ '^(0|[1-9][0-9]*)$'
    OR r->>'expectedLineage' !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'complete forward correction request required'; END IF;
  SELECT * INTO prior FROM public.forward_corrective_generation_links WHERE admission_id=(r->>'admissionId')::uuid FOR UPDATE;
  IF FOUND THEN
    IF prior.request_key IS DISTINCT FROM r->>'key' OR prior.envelope_digest IS DISTINCT FROM r->>'envelopeDigest'
      OR prior.bad_operation_id::text IS DISTINCT FROM r->>'badOperationId' OR prior.bad_generation_record_id::text IS DISTINCT FROM r->>'badGenerationRecordId'
      OR prior.predecessor_generation::text IS DISTINCT FROM r->>'expectedGeneration' OR prior.predecessor_lineage IS DISTINCT FROM r->>'expectedLineage'
      THEN RAISE EXCEPTION 'forward correction idempotency conflict'; END IF;
    RETURN jsonb_build_object('state','LINKED');
  END IF;
  SELECT * INTO admission FROM public.promotion_ready_envelope_admissions WHERE id=(r->>'admissionId')::uuid FOR SHARE;
  SELECT * INTO bad_operation FROM public.generation_promotion_operations WHERE id=(r->>'badOperationId')::uuid FOR SHARE;
  SELECT * INTO bad_record FROM public.governed_generation_records WHERE id=(r->>'badGenerationRecordId')::uuid FOR SHARE;
  SELECT * INTO catalog FROM public.governed_catalogs WHERE id='catalog' FOR UPDATE;
  IF NOT FOUND OR admission.id IS NULL OR bad_operation.id IS NULL OR bad_record.id IS NULL
    OR bad_operation.generation_record_id IS DISTINCT FROM bad_record.id OR admission.envelope_digest IS DISTINCT FROM r->>'envelopeDigest'
    OR admission.predecessor_generation::text IS DISTINCT FROM r->>'expectedGeneration' OR admission.predecessor_lineage IS DISTINCT FROM r->>'expectedLineage'
    OR catalog.state <> 'LIVE' OR catalog.governed_generation::text IS DISTINCT FROM r->>'expectedGeneration'
    OR catalog.authority_adoption->>'lineage' IS DISTINCT FROM r->>'expectedLineage' THEN
    INSERT INTO public.catalog_restriction_facts(fact,reason) VALUES ('commercial-data','forward correction boundary unresolved') ON CONFLICT (fact) DO NOTHING;
    INSERT INTO public.catalog_restriction_surfaces(fact,surface) VALUES ('commercial-data','catalog') ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('state','RESTRICTED');
  END IF;
  digest := 'sha256:' || encode(sha256(convert_to(public.canonical_json_text(r),'UTF8')),'hex');
  INSERT INTO public.forward_corrective_generation_links(admission_id,request_key,bad_operation_id,bad_generation_record_id,predecessor_generation,predecessor_lineage,envelope_digest,audit_digest)
  VALUES(admission.id,r->>'key',bad_operation.id,bad_record.id,admission.predecessor_generation,admission.predecessor_lineage,admission.envelope_digest,digest);
  RETURN jsonb_build_object('state','LINKED');
END $$;

-- The existing sole promotion transaction records a linked correction only under its linked idempotency key.
GRANT EXECUTE ON FUNCTION public.promote_delta(JSONB) TO ofertasuper_authority;
CREATE FUNCTION public.guard_forward_correction_promotion() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE linked_key TEXT;
BEGIN
  SELECT l.request_key INTO linked_key FROM public.governed_generation_records g
  JOIN public.sealed_generation_manifests m ON m.id=g.manifest_id
  JOIN public.forward_corrective_generation_links l ON l.admission_id=m.admission_id
  WHERE g.id=NEW.generation_record_id;
  IF linked_key IS NOT NULL AND linked_key IS DISTINCT FROM NEW.request_key THEN RAISE EXCEPTION 'forward correction promotion key conflict'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER forward_correction_promotion_guard BEFORE INSERT ON public.generation_promotion_operations
FOR EACH ROW EXECUTE FUNCTION public.guard_forward_correction_promotion();
REVOKE ALL ON public.forward_corrective_generation_links FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_forward_correction(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_forward_correction(JSONB) TO ofertasuper_authority;
