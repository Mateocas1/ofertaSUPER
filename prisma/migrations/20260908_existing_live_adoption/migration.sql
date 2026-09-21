-- U11b4: independently attest the current LIVE generation without using publisher JSON as proof.
CREATE TABLE public.existing_live_adoptions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  request_key TEXT NOT NULL UNIQUE,
  publication_id TEXT NOT NULL REFERENCES public.production_readiness_publications(id) ON DELETE RESTRICT,
  authority_operation_id TEXT NOT NULL REFERENCES public.authority_lifecycle_outcomes(operation_id) ON DELETE RESTRICT,
  generation_record_id UUID REFERENCES public.governed_generation_records(id) ON DELETE RESTRICT,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  incarnation UUID NOT NULL,
  policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^sha256:[a-f0-9]{64}$'),
  lineage TEXT NOT NULL CHECK (lineage ~ '^sha256:[a-f0-9]{64}$'),
  health_version BIGINT NOT NULL CHECK (health_version >= 0),
  build_digest TEXT NOT NULL CHECK (build_digest ~ '^sha256:[a-f0-9]{64}$'),
  final_checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  proof JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (publication_id, generation, lineage, health_version, build_digest),
  CHECK ((generation = 0 AND generation_record_id IS NULL) OR (generation > 0 AND generation_record_id IS NOT NULL)),
  CHECK (final_checked_at < expires_at)
);
CREATE FUNCTION public.prevent_existing_live_adoption_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN
  RAISE EXCEPTION 'existing LIVE adoption is immutable';
END $$;
CREATE TRIGGER existing_live_adoptions_immutable BEFORE UPDATE OR DELETE ON public.existing_live_adoptions
FOR EACH ROW EXECUTE FUNCTION public.prevent_existing_live_adoption_mutation();

CREATE FUNCTION public.adopt_existing_live(r JSONB) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  catalog public.governed_catalogs%ROWTYPE; authority public.authority_lifecycle_outcomes%ROWTYPE;
  publication public.production_readiness_publications%ROWTYPE; promotion public.production_readiness_promotions%ROWTYPE;
  candidate public.authority_candidates%ROWTYPE; baseline public.baseline_manifests%ROWTYPE;
  policy public.refresh_policies%ROWTYPE; record public.governed_generation_records%ROWTYPE; operation public.generation_promotion_operations%ROWTYPE;
  adoption JSONB; expiry TIMESTAMPTZ; checked TIMESTAMPTZ; prior public.existing_live_adoptions%ROWTYPE;
  keys TEXT[] := ARRAY['key','publicationId','expectedGeneration','expectedLineage','expectedHealthVersion','expectedBuildDigest','expectedPolicyDigest'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT coalesce(r ?& keys,false) OR r - keys <> '{}'::jsonb OR octet_length(r::text)>8192
    OR length(r->>'key') NOT BETWEEN 1 AND 256 OR r->>'key' !~ '^[a-zA-Z0-9:_-]+$' OR r->>'expectedGeneration' !~ '^(0|[1-9][0-9]*)$'
    OR r->>'expectedHealthVersion' !~ '^(0|[1-9][0-9]*)$'
    OR r->>'expectedLineage' !~ '^sha256:[a-f0-9]{64}$' OR r->>'expectedBuildDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR r->>'expectedPolicyDigest' !~ '^sha256:[a-f0-9]{64}$' THEN RAISE EXCEPTION 'complete existing LIVE adoption request required'; END IF;
  SELECT * INTO prior FROM public.existing_live_adoptions WHERE request_key=r->>'key' FOR UPDATE;
  IF FOUND THEN
    IF prior.publication_id IS DISTINCT FROM r->>'publicationId' OR prior.generation::text IS DISTINCT FROM r->>'expectedGeneration'
      OR prior.lineage IS DISTINCT FROM r->>'expectedLineage' OR prior.health_version::text IS DISTINCT FROM r->>'expectedHealthVersion'
      OR prior.build_digest IS DISTINCT FROM r->>'expectedBuildDigest' OR prior.policy_digest IS DISTINCT FROM r->>'expectedPolicyDigest'
      THEN RAISE EXCEPTION 'existing LIVE adoption idempotency conflict'; END IF;
    RETURN prior.request_key;
  END IF;
  SELECT * INTO catalog FROM public.governed_catalogs WHERE id='catalog' FOR UPDATE;
  SELECT * INTO publication FROM public.production_readiness_publications WHERE id=r->>'publicationId' FOR SHARE;
  SELECT * INTO promotion FROM public.production_readiness_promotions WHERE id=publication.promotion_id FOR SHARE;
  SELECT * INTO authority FROM public.authority_lifecycle_outcomes WHERE publication_id=publication.id FOR SHARE;
  SELECT * INTO candidate FROM public.authority_candidates WHERE manifest_digest=promotion.candidate_digest FOR SHARE;
  IF NOT FOUND OR authority.operation_id IS NULL OR catalog.state <> 'LIVE' OR catalog.governed_generation IS NULL OR publication.state <> 'PROMOTED'
    OR promotion.state <> 'PROMOTED' OR candidate.id IS NULL OR candidate.deployment_id <> promotion.deployment_id
    OR candidate.full_sha <> promotion.commit_sha OR candidate.target <> publication.target THEN RAISE EXCEPTION 'existing LIVE authority binding required'; END IF;
  IF catalog.governed_generation::text IS DISTINCT FROM r->>'expectedGeneration' THEN RAISE EXCEPTION 'stale existing LIVE generation binding'; END IF;
  SELECT * INTO policy FROM public.refresh_policies WHERE id=candidate.policy_id FOR SHARE;
  IF NOT FOUND OR policy.digest IS DISTINCT FROM r->>'expectedPolicyDigest' THEN RAISE EXCEPTION 'existing LIVE policy binding required'; END IF;
  IF catalog.governed_generation = 0 THEN
    SELECT * INTO baseline FROM public.baseline_manifests WHERE id=candidate.baseline_manifest_id FOR SHARE;
    adoption := authority.proof->'adoption';
    IF authority.final_checked_at >= authority.expires_at OR baseline.root_digest IS NULL
      OR authority.proof IS NULL OR authority.proof->'adoption' IS NULL
      OR r->>'expectedLineage' IS DISTINCT FROM baseline.root_digest
      OR adoption->>'generation' IS DISTINCT FROM '0' OR adoption->>'lineage' IS DISTINCT FROM baseline.root_digest
      OR adoption->>'policyDigest' IS DISTINCT FROM r->>'expectedPolicyDigest'
      OR adoption->>'buildDigest' IS DISTINCT FROM r->>'expectedBuildDigest'
      OR adoption->>'healthVersion' IS DISTINCT FROM r->>'expectedHealthVersion'
      OR adoption->>'incarnation' IS DISTINCT FROM catalog.authority_adoption->>'incarnation' THEN
      RAISE EXCEPTION 'unverified existing LIVE baseline proof';
    END IF;
    expiry := least(authority.expires_at, promotion.expires_at, candidate.expires_at);
  ELSE
    SELECT * INTO record FROM public.governed_generation_records WHERE generation=catalog.governed_generation
      AND incarnation::text=catalog.authority_adoption->>'incarnation' FOR SHARE;
    SELECT * INTO operation FROM public.generation_promotion_operations WHERE generation_record_id=record.id FOR SHARE;
    IF NOT FOUND OR record.id IS NULL OR operation.id IS NULL OR record.policy_digest IS DISTINCT FROM r->>'expectedPolicyDigest' OR record.result_lineage IS DISTINCT FROM r->>'expectedLineage'
      OR record.health_version::text IS DISTINCT FROM r->>'expectedHealthVersion' OR record.build_digest IS DISTINCT FROM r->>'expectedBuildDigest'
      OR operation.outcome IS NULL OR operation.outcome->>'generation' IS DISTINCT FROM record.generation::text OR operation.outcome->>'lineage' IS DISTINCT FROM record.result_lineage
      THEN RAISE EXCEPTION 'unverified existing LIVE generation proof'; END IF;
    expiry := least(authority.expires_at, promotion.expires_at, candidate.expires_at, (operation.outcome->>'expiresAt')::timestamptz);
  END IF;
  IF catalog.authority_adoption->>'generation' IS DISTINCT FROM r->>'expectedGeneration'
    OR catalog.authority_adoption->>'lineage' IS DISTINCT FROM r->>'expectedLineage'
    OR catalog.authority_adoption->>'healthVersion' IS DISTINCT FROM r->>'expectedHealthVersion'
    OR catalog.authority_adoption->>'buildDigest' IS DISTINCT FROM r->>'expectedBuildDigest'
    OR catalog.authority_adoption->>'policyDigest' IS DISTINCT FROM r->>'expectedPolicyDigest' THEN RAISE EXCEPTION 'existing LIVE adoption drift conflict'; END IF;
  checked := clock_timestamp();
  IF checked >= expiry THEN RAISE EXCEPTION 'late-ineligible existing LIVE adoption requires forward recovery'; END IF;
  INSERT INTO public.existing_live_adoptions(request_key,publication_id,authority_operation_id,generation_record_id,generation,incarnation,policy_digest,lineage,health_version,build_digest,final_checked_at,expires_at,proof)
    VALUES(r->>'key',publication.id,authority.operation_id,record.id,catalog.governed_generation,(catalog.authority_adoption->>'incarnation')::uuid,r->>'expectedPolicyDigest',r->>'expectedLineage',(r->>'expectedHealthVersion')::bigint,r->>'expectedBuildDigest',checked,expiry,
      jsonb_build_object('publicationId',publication.id,'authorityOperationId',authority.operation_id,'generation',catalog.governed_generation::text,'lineage',r->>'expectedLineage','policyDigest',r->>'expectedPolicyDigest','healthVersion',r->>'expectedHealthVersion','buildDigest',r->>'expectedBuildDigest'));
  RETURN r->>'key';
END $$;
REVOKE ALL ON public.existing_live_adoptions FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adopt_existing_live(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adopt_existing_live(JSONB) TO ofertasuper_authority;
