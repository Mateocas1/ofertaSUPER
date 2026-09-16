-- U12c: exact recovery observes a prior U12b2 effect; it cannot promote, adopt, renew, or revive it.
CREATE FUNCTION public.inspect_delta_promotion(r JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  operation public.generation_promotion_operations%ROWTYPE;
  record public.governed_generation_records%ROWTYPE;
  observed TIMESTAMPTZ;
  checked TIMESTAMPTZ;
  expiry TIMESTAMPTZ;
  eligible BOOLEAN;
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT (r ? 'key') OR r - 'key' <> '{}'::jsonb OR length(r->>'key') NOT BETWEEN 1 AND 256
    OR r->>'key' !~ '^[a-zA-Z0-9:_-]+$' THEN RAISE EXCEPTION 'exact promotion recovery key required'; END IF;

  SELECT * INTO operation FROM public.generation_promotion_operations WHERE request_key=r->>'key';
  IF NOT FOUND THEN RAISE EXCEPTION 'promotion recovery outcome is unknown'; END IF;
  SELECT * INTO record FROM public.governed_generation_records WHERE id=operation.generation_record_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'promotion recovery proof is incomplete'; END IF;
  checked := (operation.outcome->>'finalCheckedAt')::timestamptz;
  expiry := (operation.outcome->>'expiresAt')::timestamptz;
  observed := clock_timestamp();
  SELECT EXISTS (
    SELECT 1 FROM public.generation_publishing_adoptions publishing
    JOIN public.production_readiness_publications publication ON publication.id=publishing.publication_id
    JOIN public.production_readiness_promotions promotion ON promotion.id=publication.promotion_id
    JOIN public.authority_lifecycle_outcomes authority ON authority.publication_id=publication.id
    JOIN public.governed_catalogs catalog ON catalog.id='catalog'
    WHERE publishing.generation_record_id=record.id
      AND publication.id=operation.outcome->>'publicationId'
      AND publication.state='PROMOTED' AND promotion.state='PROMOTED'
      AND catalog.state='LIVE' AND catalog.governed_generation=record.generation
      AND catalog.authority_adoption->>'generation'=record.generation::text
      AND catalog.authority_adoption->>'lineage'=record.result_lineage
      AND operation.outcome->>'generation'=record.generation::text
      AND operation.outcome->>'lineage'=record.result_lineage
      AND NOT EXISTS (SELECT 1 FROM public.authority_revoke_outcomes revoked WHERE revoked.authority_operation_id=authority.operation_id)
  ) INTO eligible;
  RETURN operation.outcome || jsonb_build_object(
    'generationRecordId', record.id,
    'resultObservedAt', observed,
    'eligibleNow', observed < expiry AND eligible,
    'eligibleObservationProven', checked < observed AND observed < expiry AND eligible
  );
END $$;
REVOKE ALL ON FUNCTION public.inspect_delta_promotion(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspect_delta_promotion(JSONB) TO ofertasuper_authority;
