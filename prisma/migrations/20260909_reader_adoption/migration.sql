-- U13a: reader authority is a distinct immutable admission, never inherited from publisher adoption.
CREATE TABLE public.catalog_restriction_facts (
  fact TEXT PRIMARY KEY CHECK (fact IN ('commercial-data','authority-evidence')),
  restricted_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 256)
);
CREATE TABLE public.catalog_restriction_surfaces (
  fact TEXT NOT NULL,
  surface TEXT NOT NULL CHECK (surface IN ('catalog','search','product','history')),
  PRIMARY KEY (fact, surface),
  FOREIGN KEY (fact) REFERENCES public.catalog_restriction_facts(fact) ON DELETE RESTRICT
);
CREATE TABLE public.reader_generation_adoptions (
  id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  request_key TEXT NOT NULL UNIQUE,
  reader_id TEXT NOT NULL CHECK (length(reader_id) BETWEEN 1 AND 256),
  existing_live_adoption_id UUID NOT NULL REFERENCES public.existing_live_adoptions(id) ON DELETE RESTRICT,
  generation BIGINT NOT NULL CHECK (generation >= 0),
  lineage TEXT NOT NULL CHECK (lineage ~ '^sha256:[a-f0-9]{64}$'),
  policy_digest TEXT NOT NULL CHECK (policy_digest ~ '^sha256:[a-f0-9]{64}$'),
  health_version BIGINT NOT NULL CHECK (health_version >= 0),
  build_digest TEXT NOT NULL CHECK (build_digest ~ '^sha256:[a-f0-9]{64}$'),
  surface TEXT NOT NULL CHECK (surface IN ('catalog','search','product','history')),
  final_checked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  UNIQUE (reader_id, existing_live_adoption_id, surface),
  CHECK (final_checked_at < expires_at)
);
CREATE FUNCTION public.prevent_reader_generation_adoption_mutation() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$ BEGIN
  RAISE EXCEPTION 'reader generation adoption is immutable';
END $$;
CREATE TRIGGER reader_generation_adoptions_immutable BEFORE UPDATE OR DELETE ON public.reader_generation_adoptions
FOR EACH ROW EXECUTE FUNCTION public.prevent_reader_generation_adoption_mutation();

CREATE FUNCTION public.adopt_generation(r JSONB) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  prior public.reader_generation_adoptions%ROWTYPE; publisher public.existing_live_adoptions%ROWTYPE;
  authority public.authority_lifecycle_outcomes%ROWTYPE; catalog public.governed_catalogs%ROWTYPE;
  expiry TIMESTAMPTZ; checked TIMESTAMPTZ;
  keys TEXT[] := ARRAY['key','readerId','existingLiveAdoptionId','expectedGeneration','expectedLineage','expectedPolicyDigest','expectedHealthVersion','expectedBuildDigest','surface'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT coalesce(r ?& keys,false) OR r - keys <> '{}'::jsonb OR octet_length(r::text) > 8192
    OR length(r->>'key') NOT BETWEEN 1 AND 256 OR r->>'key' !~ '^[a-zA-Z0-9:_-]+$'
    OR length(r->>'readerId') NOT BETWEEN 1 AND 256 OR r->>'readerId' !~ '^.+$'
    OR r->>'existingLiveAdoptionId' !~ '^[0-9a-f-]{36}$' OR r->>'expectedGeneration' !~ '^(0|[1-9][0-9]*)$'
    OR r->>'expectedHealthVersion' !~ '^(0|[1-9][0-9]*)$' OR r->>'expectedLineage' !~ '^sha256:[a-f0-9]{64}$'
    OR r->>'expectedPolicyDigest' !~ '^sha256:[a-f0-9]{64}$' OR r->>'expectedBuildDigest' !~ '^sha256:[a-f0-9]{64}$'
    OR r->>'surface' NOT IN ('catalog','search','product','history') THEN RAISE EXCEPTION 'complete reader adoption request required'; END IF;
  SELECT * INTO prior FROM public.reader_generation_adoptions WHERE request_key=r->>'key' FOR UPDATE;
  IF FOUND THEN
    IF prior.reader_id IS DISTINCT FROM r->>'readerId' OR prior.existing_live_adoption_id::text IS DISTINCT FROM r->>'existingLiveAdoptionId'
      OR prior.generation::text IS DISTINCT FROM r->>'expectedGeneration' OR prior.lineage IS DISTINCT FROM r->>'expectedLineage'
      OR prior.policy_digest IS DISTINCT FROM r->>'expectedPolicyDigest' OR prior.health_version::text IS DISTINCT FROM r->>'expectedHealthVersion'
      OR prior.build_digest IS DISTINCT FROM r->>'expectedBuildDigest' OR prior.surface IS DISTINCT FROM r->>'surface'
      THEN RAISE EXCEPTION 'reader adoption idempotency conflict'; END IF;
    RETURN prior.request_key;
  END IF;
  SELECT * INTO publisher FROM public.existing_live_adoptions WHERE id=(r->>'existingLiveAdoptionId')::uuid FOR SHARE;
  SELECT * INTO authority FROM public.authority_lifecycle_outcomes WHERE operation_id=publisher.authority_operation_id FOR SHARE;
  IF NOT FOUND OR authority.operation_id IS NULL THEN RAISE EXCEPTION 'reader adoption drift conflict'; END IF;
  PERFORM 1 FROM public.authority_lifecycle_reservations v WHERE id=authority.reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reader adoption drift conflict'; END IF;
  SELECT * INTO catalog FROM public.governed_catalogs WHERE id='catalog' FOR SHARE;
  IF NOT FOUND OR publisher.id IS NULL OR catalog.state <> 'LIVE' OR catalog.governed_generation IS NULL
    OR publisher.generation::text IS DISTINCT FROM r->>'expectedGeneration' OR publisher.lineage IS DISTINCT FROM r->>'expectedLineage'
    OR publisher.policy_digest IS DISTINCT FROM r->>'expectedPolicyDigest' OR publisher.health_version::text IS DISTINCT FROM r->>'expectedHealthVersion'
    OR publisher.build_digest IS DISTINCT FROM r->>'expectedBuildDigest' OR catalog.authority_adoption->>'generation' IS DISTINCT FROM r->>'expectedGeneration'
    OR catalog.authority_adoption->>'lineage' IS DISTINCT FROM r->>'expectedLineage' OR catalog.authority_adoption->>'policyDigest' IS DISTINCT FROM r->>'expectedPolicyDigest'
    OR catalog.authority_adoption->>'healthVersion' IS DISTINCT FROM r->>'expectedHealthVersion' OR catalog.authority_adoption->>'buildDigest' IS DISTINCT FROM r->>'expectedBuildDigest'
    THEN RAISE EXCEPTION 'reader adoption drift conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.authority_revoke_outcomes WHERE authority_operation_id=publisher.authority_operation_id)
    THEN RAISE EXCEPTION 'reader adoption authority is revoked'; END IF;
  IF EXISTS (SELECT 1 FROM public.catalog_restriction_facts f LEFT JOIN public.catalog_restriction_surfaces s ON s.fact=f.fact WHERE s.fact IS NULL OR s.surface=r->>'surface')
    THEN RAISE EXCEPTION 'unknown restriction boundary or restricted reader surface'; END IF;
  expiry := publisher.expires_at; checked := clock_timestamp();
  IF checked >= expiry THEN RAISE EXCEPTION 'reader adoption is expired'; END IF;
  INSERT INTO public.reader_generation_adoptions(request_key,reader_id,existing_live_adoption_id,generation,lineage,policy_digest,health_version,build_digest,surface,final_checked_at,expires_at)
  VALUES(r->>'key',r->>'readerId',publisher.id,publisher.generation,publisher.lineage,publisher.policy_digest,publisher.health_version,publisher.build_digest,r->>'surface',checked,expiry);
  RETURN r->>'key';
END $$;
REVOKE ALL ON public.reader_generation_adoptions,public.catalog_restriction_facts,public.catalog_restriction_surfaces FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adopt_generation(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adopt_generation(JSONB) TO ofertasuper_authority;
