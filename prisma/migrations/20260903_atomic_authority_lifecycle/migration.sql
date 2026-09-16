-- U11: metadata-only initial activation. No ingress or runtime execution grants are installed here.
ALTER TABLE public.publication_grants DROP CONSTRAINT publication_grants_action_check;
ALTER TABLE public.publication_grants ADD CONSTRAINT publication_grants_action_check CHECK (action IN ('approve','activate'));
CREATE TABLE public.authority_lifecycle_reservations (
  id TEXT PRIMARY KEY, selector JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 0,
  build_digest TEXT NOT NULL, configuration_receipt TEXT NOT NULL
);
CREATE UNIQUE INDEX authority_reserved_publication ON public.authority_lifecycle_reservations ((selector->>'publicationId'));
CREATE TABLE public.authority_lifecycle_outcomes (
  operation_id TEXT PRIMARY KEY, request JSONB NOT NULL,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES public.authority_lifecycle_reservations(id) ON DELETE RESTRICT,
  approval_id TEXT NOT NULL UNIQUE REFERENCES public.approval_receipts(idempotency_key) ON DELETE RESTRICT,
  verification_id TEXT NOT NULL REFERENCES public.candidate_technical_verifications(id) ON DELETE RESTRICT,
  publication_id TEXT NOT NULL UNIQUE REFERENCES public.production_readiness_publications(id) ON DELETE RESTRICT,
  final_checked_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  proof JSONB NOT NULL, CHECK (final_checked_at < expires_at)
);
CREATE TABLE public.authority_lifecycle_audits (
  operation_id TEXT PRIMARY KEY REFERENCES public.authority_lifecycle_outcomes(operation_id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL, transition TEXT NOT NULL, evidence JSONB NOT NULL
);
ALTER TABLE public.baseline_build_attempts DROP CONSTRAINT baseline_build_attempts_status_check;
ALTER TABLE public.baseline_build_attempts ADD CONSTRAINT baseline_build_attempts_status_check
  CHECK (status IN ('BUILDING','FROZEN','ABANDONED','LIVE'));
ALTER TABLE public.governed_catalogs ADD COLUMN authority_adoption JSONB;
CREATE TRIGGER authority_lifecycle_outcomes_immutable BEFORE UPDATE OR DELETE ON public.authority_lifecycle_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER authority_lifecycle_audits_immutable BEFORE UPDATE OR DELETE ON public.authority_lifecycle_audits
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE OR REPLACE FUNCTION public.guard_governed_catalog_mutation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('governed_catalog.procedure', true),'') NOT IN
    ('begin_baseline','seal_baseline','abandon_baseline','cleanup_baseline','activate_authority') THEN
    RAISE EXCEPTION 'governed catalog mutations require a guarded procedure';
  END IF;
  RETURN NEW;
END; $$;

CREATE FUNCTION public.activate_authority(r JSONB) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  a public.approval_receipts%ROWTYPE; c public.authority_candidates%ROWTYPE;
  v public.candidate_technical_verifications%ROWTYPE; b public.baseline_manifests%ROWTYPE;
  reservation public.authority_lifecycle_reservations%ROWTYPE;
  catalog public.governed_catalogs%ROWTYPE; attempt public.baseline_build_attempts%ROWTYPE;
  prior public.authority_lifecycle_outcomes%ROWTYPE;
  policy TEXT; expiry TIMESTAMPTZ; checked TIMESTAMPTZ; executor_expiry TIMESTAMPTZ; adoption JSONB; proof JSONB;
  keys TEXT[] := ARRAY['key','reservationId','approvalId','verificationId','attemptId','expectedEpoch','expectedVersion','expectedGeneration','actorId'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT r ?& keys OR r - keys <> '{}'::jsonb OR octet_length(r::text)>8192
    OR EXISTS (SELECT 1 FROM jsonb_each(r) e WHERE e.key <> 'expectedGeneration' AND e.value IN ('null'::jsonb,'""'::jsonb)) THEN
    RAISE EXCEPTION 'complete activation request required';
  END IF;
  SELECT * INTO a FROM public.approval_receipts WHERE idempotency_key=r->>'approvalId';
  IF NOT FOUND OR a.grant_expires_at IS NULL THEN RAISE EXCEPTION 'bound approval required'; END IF;
  SELECT * INTO c FROM public.authority_candidates WHERE id=a.candidate_admission_id;
  SELECT digest INTO policy FROM public.refresh_policies WHERE id=c.policy_id;
  SELECT expires_at INTO executor_expiry FROM public.publication_grants WHERE user_id=r->>'actorId' AND action='activate'
    AND scope=c.scope AND target=c.target AND policy_digest=policy
    AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'live scoped executor grant required'; END IF;
  SELECT * INTO reservation FROM public.authority_lifecycle_reservations WHERE id=r->>'reservationId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation required'; END IF;
  SELECT * INTO prior FROM public.authority_lifecycle_outcomes WHERE operation_id=r->>'key';
  IF FOUND THEN
    IF prior.request IS DISTINCT FROM r THEN RAISE EXCEPTION 'idempotency conflict'; END IF;
    RETURN prior.operation_id;
  END IF;
  IF reservation.version <> (r->>'expectedVersion')::integer OR EXISTS (
    SELECT 1 FROM public.authority_lifecycle_outcomes WHERE reservation_id=reservation.id
  ) THEN RAISE EXCEPTION 'reservation conflict'; END IF;
  SELECT * INTO catalog FROM public.governed_catalogs WHERE id='catalog' FOR UPDATE;
  SELECT * INTO attempt FROM public.baseline_build_attempts WHERE id=r->>'attemptId' FOR UPDATE;
  SELECT * INTO b FROM public.baseline_manifests WHERE id=c.baseline_manifest_id;
  SELECT * INTO v FROM public.candidate_technical_verifications WHERE id=r->>'verificationId';
  IF catalog.state IS DISTINCT FROM 'FROZEN' OR catalog.cleanup_attempt_id IS NOT NULL
    OR catalog.governed_generation IS NOT NULL OR r->>'expectedGeneration' IS NOT NULL
    OR attempt.status IS DISTINCT FROM 'FROZEN' OR catalog.active_build_attempt_id IS DISTINCT FROM attempt.id
    OR catalog.build_epoch IS DISTINCT FROM (r->>'expectedEpoch')::bigint
    OR attempt.epoch IS DISTINCT FROM catalog.build_epoch OR b.build_epoch IS DISTINCT FROM attempt.epoch
    OR b.provenance_bytes::jsonb->>'buildAttemptId' IS DISTINCT FROM attempt.id
    OR attempt.root_digest IS NULL OR attempt.snapshot_id IS NULL
    OR b.root_digest IS DISTINCT FROM attempt.root_digest
    OR attempt.verifier_root_digest IS DISTINCT FROM attempt.root_digest
    OR attempt.snapshot_id IS DISTINCT FROM attempt.verifier_snapshot_id
    OR attempt.uploaded_row_count IS DISTINCT FROM attempt.expected_row_count
    OR EXISTS (SELECT 1 FROM public.baseline_build_credentials WHERE attempt_id=attempt.id AND invalidated_at IS NOT NULL)
    THEN RAISE EXCEPTION 'current FROZEN epoch binding required'; END IF;
  IF v.candidate_id IS DISTINCT FROM c.id OR v.id IS DISTINCT FROM a.candidate_verification_id
    OR v.result IS DISTINCT FROM 'PASS' OR v.revoked_at IS NOT NULL
    OR a.reviewed_payload_bytes IS DISTINCT FROM c.manifest_bytes OR a.reviewed_payload_digest IS DISTINCT FROM c.manifest_digest
    OR reservation.selector->>'version' IS DISTINCT FROM '2'
    OR reservation.selector->>'domain' IS DISTINCT FROM c.domain OR reservation.selector->>'scope' IS DISTINCT FROM c.scope
    OR reservation.selector->>'target' IS DISTINCT FROM c.target OR reservation.selector->>'deploymentId' IS DISTINCT FROM c.deployment_id
    OR v.evidence_bytes::jsonb->>'buildDigest' IS DISTINCT FROM reservation.build_digest
    OR v.evidence_bytes::jsonb->'selector' IS DISTINCT FROM reservation.selector
    THEN RAISE EXCEPTION 'approval verification reservation binding conflict'; END IF;
  expiry := least(c.expires_at,a.grant_expires_at,v.deadline_at,attempt.deadline_at);
  checked := clock_timestamp();
  IF checked >= expiry OR checked >= executor_expiry OR c.valid_from > checked OR v.verified_at > a.approved_at OR a.approved_at > checked THEN
    RAISE EXCEPTION 'final DB-clock validity check failed';
  END IF;
  adoption := jsonb_build_object('generation','0','incarnation',reservation.selector->>'incarnation',
    'policyDigest',policy,'lineage',b.root_digest,'healthVersion','0','buildDigest',reservation.build_digest,
    'publicationId',reservation.selector->>'publicationId','verificationId',v.id,'approvalId',a.idempotency_key);
  proof := jsonb_build_object('operationId',r->>'key','candidate',to_jsonb(c),'approval',to_jsonb(a),
    'verification',to_jsonb(v),'selector',reservation.selector,'adoption',adoption,
    'executingActor',r->>'actorId','finalCheckedAt',checked,'expiresAt',expiry,'state','PROMOTED');
  INSERT INTO public.production_readiness_promotions
    (id,candidate_digest,deployment_id,commit_sha,owner,rollback_authority,expires_at,state,updated_at)
    VALUES (r->>'key',c.manifest_digest,c.deployment_id,c.full_sha,a.actor_id,a.actor_id,expiry,'PROMOTED',checked);
  INSERT INTO public.production_readiness_publications (id,promotion_id,target,state)
    VALUES (reservation.selector->>'publicationId',r->>'key',c.target,'PROMOTED');
  INSERT INTO public.production_readiness_receipts (id,promotion_id,kind,payload_digest,signer,scope,expires_at,state)
    VALUES ((r->>'key')||':authorization',r->>'key','AUTHORIZATION',a.reviewed_payload_digest,a.actor_id,c.scope,expiry,'PROMOTED'),
      ((r->>'key')||':provenance',r->>'key','PROVENANCE',v.evidence_digest,v.verifier_id,c.scope,expiry,'PROMOTED');
  INSERT INTO public.authority_lifecycle_outcomes VALUES
    (r->>'key',r,reservation.id,a.idempotency_key,v.id,reservation.selector->>'publicationId',checked,expiry,proof);
  INSERT INTO public.authority_lifecycle_audits VALUES (r->>'key',r->>'actorId','PENDING->PROMOTED',proof);
  PERFORM set_config('governed_catalog.procedure','activate_authority',true);
  UPDATE public.governed_catalogs SET state='LIVE',governed_generation=0,authority_adoption=adoption WHERE id='catalog';
  UPDATE public.baseline_build_attempts SET status='LIVE' WHERE id=attempt.id;
  UPDATE public.authority_lifecycle_reservations SET version=version+1 WHERE id=reservation.id;
  RETURN r->>'key';
END; $$;

REVOKE ALL ON public.authority_lifecycle_reservations,public.authority_lifecycle_outcomes,public.authority_lifecycle_audits FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_authority(JSONB) FROM PUBLIC;

-- Recovery is observational even after expiry; it neither acknowledges nor publishes.
CREATE FUNCTION public.inspect_authority(operation TEXT, reservation TEXT, actor TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  outcome public.authority_lifecycle_outcomes%ROWTYPE; observed TIMESTAMPTZ; eligible BOOLEAN;
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  SELECT * INTO outcome FROM public.authority_lifecycle_outcomes WHERE operation_id=operation;
  IF NOT FOUND THEN RAISE EXCEPTION 'operation not found'; END IF;
  IF outcome.reservation_id IS DISTINCT FROM reservation THEN RAISE EXCEPTION 'identity conflict'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.publication_grants WHERE user_id=actor AND action='activate'
    AND scope=outcome.proof->'candidate'->>'scope' AND target=outcome.proof->'candidate'->>'target'
    AND policy_digest=outcome.proof->'adoption'->>'policyDigest' AND revoked_at IS NULL
    AND expires_at>clock_timestamp()) THEN RAISE EXCEPTION 'live scoped executor grant required'; END IF;
  observed := clock_timestamp();
  SELECT coalesce(observed < outcome.expires_at AND c.state='LIVE'
    AND c.authority_adoption=outcome.proof->'adoption'
    AND c.governed_generation::text=outcome.proof->'adoption'->>'generation'
    AND p.state='PROMOTED' AND promotion.state='PROMOTED' AND v.revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM public.authority_lifecycle_audits WHERE operation_id=operation),false)
    INTO eligible FROM public.governed_catalogs c
    JOIN public.production_readiness_publications p ON p.id=outcome.publication_id
    JOIN public.production_readiness_promotions promotion ON promotion.id=p.promotion_id
    JOIN public.candidate_technical_verifications v ON v.id=outcome.verification_id WHERE c.id='catalog';
  RETURN jsonb_build_object('operationId',outcome.operation_id,'proof',outcome.proof,
    'finalCheckedAt',outcome.final_checked_at,'expiresAt',outcome.expires_at,'observedAt',observed,
    'eligible',coalesce(eligible,false),'reason',CASE WHEN eligible THEN 'eligible' ELSE 'ineligible' END);
END; $$;
REVOKE ALL ON FUNCTION public.inspect_authority(TEXT,TEXT,TEXT) FROM PUBLIC;

-- Revoke consent is durable evidence only; U11b3 owns the authority transition.
ALTER TABLE public.publication_grants DROP CONSTRAINT publication_grants_action_check;
ALTER TABLE public.publication_grants ADD CONSTRAINT publication_grants_action_check CHECK (action IN ('approve','activate','authority-revoke'));
CREATE TABLE public.authority_revoke_challenges (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, session_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL, csrf_hash TEXT NOT NULL, reviewed JSONB NOT NULL,
  grant_id TEXT NOT NULL REFERENCES public.publication_grants(id) ON DELETE RESTRICT,
  grant_expires_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL,
  CHECK (expires_at <= grant_expires_at)
);
CREATE TABLE public.authority_revoke_receipts (
  idempotency_key TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL UNIQUE REFERENCES public.authority_revoke_challenges(id) ON DELETE RESTRICT,
  request JSONB NOT NULL, approved_at TIMESTAMPTZ NOT NULL, receipt JSONB NOT NULL
);
CREATE TRIGGER authority_revoke_challenges_immutable BEFORE UPDATE OR DELETE ON public.authority_revoke_challenges
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER authority_revoke_receipts_immutable BEFORE UPDATE OR DELETE ON public.authority_revoke_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();

CREATE FUNCTION public.authority_revoke_review(operation TEXT, reason TEXT) RETURNS JSONB
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE o public.authority_lifecycle_outcomes%ROWTYPE; v INTEGER; c public.governed_catalogs%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.authority_lifecycle_outcomes WHERE operation_id=operation;
  IF NOT FOUND THEN RAISE EXCEPTION 'authority binding required'; END IF;
  SELECT version INTO v FROM public.authority_lifecycle_reservations WHERE id=o.reservation_id FOR SHARE;
  SELECT * INTO c FROM public.governed_catalogs WHERE id='catalog' FOR SHARE;
  IF c.state IS DISTINCT FROM 'LIVE' OR c.governed_generation IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.production_readiness_publications p JOIN public.production_readiness_promotions m ON m.id=p.promotion_id
    WHERE p.id=o.publication_id AND p.state='PROMOTED' AND m.state='PROMOTED'
  ) THEN RAISE EXCEPTION 'promoted authority binding required'; END IF;
  IF reason IS NULL OR length(btrim(reason))=0 OR octet_length(reason)>2000 THEN RAISE EXCEPTION 'bounded revoke reason required'; END IF;
  RETURN jsonb_build_object('version','authority-revoke/v1','action','authority-revoke','revocationScope','authority',
    'operationId',operation,'reservationId',o.reservation_id,'publicationId',o.publication_id,'expectedVersion',v,
    'generation',c.governed_generation::text,'currentAdoption',c.authority_adoption,'identity',o.proof->'candidate',
    'selector',o.proof->'selector','policyDigest',o.proof->'adoption'->>'policyDigest',
    'scope',o.proof->'candidate'->>'scope','releaseId',o.proof->'candidate'->>'release_id','reason',reason);
END; $$;

CREATE FUNCTION public.prepare_authority_revoke_consent(r JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE g public.publication_grants%ROWTYPE; o public.authority_lifecycle_outcomes%ROWTYPE; review JSONB; expiry TIMESTAMPTZ;
BEGIN
  IF NOT coalesce(r ?& ARRAY['id','actorId','sessionHash','nonceHash','csrfHash','operationId','reason'],false)
    OR EXISTS (SELECT 1 FROM jsonb_each_text(r) e WHERE e.value IS NULL OR length(btrim(e.value))=0)
    OR octet_length(r::text)>8192 OR r->>'sessionHash' !~ '^[a-f0-9]{64}$'
    OR r->>'nonceHash' !~ '^[a-f0-9]{64}$' OR r->>'csrfHash' !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'complete revoke consent request required'; END IF;
  SELECT * INTO o FROM public.authority_lifecycle_outcomes WHERE operation_id=r->>'operationId';
  IF NOT FOUND THEN RAISE EXCEPTION 'authority binding required'; END IF;
  SELECT * INTO g FROM public.publication_grants WHERE user_id=r->>'actorId' AND action='authority-revoke'
    AND scope=o.proof->'candidate'->>'scope' AND target=o.proof->'candidate'->>'target'
    AND policy_digest=o.proof->'adoption'->>'policyDigest' AND revoked_at IS NULL AND expires_at>clock_timestamp()
    ORDER BY expires_at,id LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'live scoped revoke grant required'; END IF;
  review := public.authority_revoke_review(o.operation_id,r->>'reason');
  expiry := least(g.expires_at,clock_timestamp()+interval '10 minutes');
  IF expiry<=clock_timestamp() THEN RAISE EXCEPTION 'revoke grant expired'; END IF;
  INSERT INTO public.authority_revoke_challenges VALUES (r->>'id',r->>'actorId',r->>'sessionHash',r->>'nonceHash',r->>'csrfHash',review,g.id,g.expires_at,expiry);
  RETURN jsonb_build_object('id',r->>'id','reviewed',review,'expiresAt',expiry);
END; $$;

CREATE FUNCTION public.record_authority_revoke_consent(r JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE c public.authority_revoke_challenges%ROWTYPE; g public.publication_grants%ROWTYPE;
  prior public.authority_revoke_receipts%ROWTYPE; checked TIMESTAMPTZ; result JSONB;
BEGIN
  IF NOT coalesce(r ?& ARRAY['challengeId','key','actorId','sessionHash','nonceHash','csrfHash','reviewed','origin','fetchSite','consent'],false)
    OR octet_length(r::text)>32768 OR coalesce(length(btrim(r->>'key')),0)=0 THEN RAISE EXCEPTION 'complete revoke consent required'; END IF;
  SELECT * INTO c FROM public.authority_revoke_challenges WHERE id=r->>'challengeId' FOR UPDATE;
  IF NOT FOUND OR c.actor_id IS DISTINCT FROM r->>'actorId' OR c.session_hash IS DISTINCT FROM r->>'sessionHash'
    OR c.nonce_hash IS DISTINCT FROM r->>'nonceHash' OR c.csrf_hash IS DISTINCT FROM r->>'csrfHash'
    OR r->'consent' IS DISTINCT FROM 'true'::jsonb OR r->>'fetchSite' IS DISTINCT FROM 'same-origin'
    OR r->>'origin' IS DISTINCT FROM ('https://' || (c.reviewed->'identity'->>'domain')) THEN
    RAISE EXCEPTION 'revoke consent proof or origin invalid'; END IF;
  IF c.reviewed IS DISTINCT FROM r->'reviewed' THEN RAISE EXCEPTION 'reviewed revoke binding conflict'; END IF;
  SELECT * INTO g FROM public.publication_grants WHERE id=c.grant_id FOR SHARE;
  IF g.user_id IS DISTINCT FROM c.actor_id OR g.action IS DISTINCT FROM 'authority-revoke'
    OR g.scope IS DISTINCT FROM c.reviewed->>'scope' OR g.target IS DISTINCT FROM c.reviewed->'identity'->>'target'
    OR g.policy_digest IS DISTINCT FROM c.reviewed->>'policyDigest' OR g.revoked_at IS NOT NULL
    OR g.expires_at IS DISTINCT FROM c.grant_expires_at THEN RAISE EXCEPTION 'original revoke grant required'; END IF;
  IF c.reviewed IS DISTINCT FROM public.authority_revoke_review(c.reviewed->>'operationId',c.reviewed->>'reason') THEN
    RAISE EXCEPTION 'stale revoke binding conflict'; END IF;
  checked := clock_timestamp();
  IF checked>=c.expires_at OR checked>=g.expires_at THEN RAISE EXCEPTION 'revoke consent expired'; END IF;
  SELECT * INTO prior FROM public.authority_revoke_receipts WHERE idempotency_key=r->>'key';
  IF FOUND THEN
    IF prior.request IS DISTINCT FROM r THEN RAISE EXCEPTION 'revoke consent idempotency conflict'; END IF;
    RETURN prior.receipt;
  END IF;
  IF EXISTS (SELECT 1 FROM public.authority_revoke_receipts WHERE challenge_id=c.id) THEN RAISE EXCEPTION 'revoke consent replay'; END IF;
  result := jsonb_build_object('idempotencyKey',r->>'key','challengeId',c.id,'reviewed',c.reviewed,
    'actorId',c.actor_id,'approvedAt',checked,'expiresAt',c.expires_at,'grantExpiresAt',c.grant_expires_at);
  INSERT INTO public.authority_revoke_receipts VALUES (r->>'key',c.id,r,checked,result);
  RETURN result;
END; $$;
REVOKE ALL ON public.authority_revoke_challenges,public.authority_revoke_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authority_revoke_review(TEXT,TEXT),public.prepare_authority_revoke_consent(JSONB),public.record_authority_revoke_consent(JSONB) FROM PUBLIC;

-- Authority-only revocation: immutable consumption proof, never a data restriction.
ALTER TYPE public."ProductionReadinessState" ADD VALUE 'REVOKED';
CREATE TABLE public.authority_revoke_outcomes (
  operation_id TEXT PRIMARY KEY, request JSONB NOT NULL,
  authority_operation_id TEXT NOT NULL UNIQUE REFERENCES public.authority_lifecycle_outcomes(operation_id) ON DELETE RESTRICT,
  consent_id TEXT NOT NULL UNIQUE REFERENCES public.authority_revoke_receipts(idempotency_key) ON DELETE RESTRICT,
  final_checked_at TIMESTAMPTZ NOT NULL, proof JSONB NOT NULL
);
CREATE TABLE public.authority_revoke_audits (
  operation_id TEXT PRIMARY KEY REFERENCES public.authority_revoke_outcomes(operation_id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL, transition TEXT NOT NULL, evidence JSONB NOT NULL
);
CREATE TRIGGER authority_revoke_outcomes_immutable BEFORE UPDATE OR DELETE ON public.authority_revoke_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER authority_revoke_audits_immutable BEFORE UPDATE OR DELETE ON public.authority_revoke_audits
  FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE FUNCTION public.revoke_authority(r JSONB) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  consent public.authority_revoke_receipts%ROWTYPE; challenge public.authority_revoke_challenges%ROWTYPE;
  grant_row public.publication_grants%ROWTYPE; prior public.authority_revoke_outcomes%ROWTYPE;
  authority public.authority_lifecycle_outcomes%ROWTYPE; version INTEGER; checked TIMESTAMPTZ; proof JSONB;
  keys TEXT[] := ARRAY['key','operationId','reservationId','consentId','expectedVersion','actorId','sessionHash'];
BEGIN
  IF session_user::text <> 'ofertasuper_authority' THEN RAISE EXCEPTION 'authority backend session required'; END IF;
  IF NOT coalesce(r ?& keys,false) OR r - keys <> '{}'::jsonb OR octet_length(r::text)>8192
    OR EXISTS (SELECT 1 FROM jsonb_each_text(r) e WHERE e.value IS NULL OR length(btrim(e.value))=0)
    OR r->>'sessionHash' !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'complete revoke request required'; END IF;
  SELECT * INTO consent FROM public.authority_revoke_receipts WHERE idempotency_key=r->>'consentId' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revoke consent not found'; END IF;
  SELECT * INTO challenge FROM public.authority_revoke_challenges WHERE id=consent.challenge_id;
  IF challenge.actor_id IS DISTINCT FROM r->>'actorId' OR challenge.session_hash IS DISTINCT FROM r->>'sessionHash'
    THEN RAISE EXCEPTION 'revoke consent proof invalid'; END IF;
  IF challenge.reviewed->>'operationId' IS DISTINCT FROM r->>'operationId'
    OR challenge.reviewed->>'reservationId' IS DISTINCT FROM r->>'reservationId'
    OR challenge.reviewed->'expectedVersion' IS DISTINCT FROM r->'expectedVersion'
    THEN RAISE EXCEPTION 'revoke binding conflict'; END IF;
  SELECT * INTO grant_row FROM public.publication_grants WHERE id=challenge.grant_id FOR SHARE;
  IF grant_row.user_id IS DISTINCT FROM challenge.actor_id OR grant_row.action IS DISTINCT FROM 'authority-revoke'
    OR grant_row.scope IS DISTINCT FROM challenge.reviewed->>'scope'
    OR grant_row.target IS DISTINCT FROM challenge.reviewed->'identity'->>'target'
    OR grant_row.policy_digest IS DISTINCT FROM challenge.reviewed->>'policyDigest' OR grant_row.revoked_at IS NOT NULL
    OR grant_row.expires_at IS DISTINCT FROM challenge.grant_expires_at THEN RAISE EXCEPTION 'original revoke grant required'; END IF;
  SELECT v.version INTO version FROM public.authority_lifecycle_reservations v WHERE id=r->>'reservationId' FOR UPDATE;
  IF grant_row.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'final revoke grant expired'; END IF;
  SELECT * INTO prior FROM public.authority_revoke_outcomes WHERE operation_id=r->>'key';
  IF FOUND THEN
    IF prior.request IS DISTINCT FROM r THEN RAISE EXCEPTION 'revoke idempotency conflict'; END IF;
    RETURN prior.operation_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.authority_revoke_outcomes WHERE consent_id=consent.idempotency_key
    OR authority_operation_id=r->>'operationId') THEN RAISE EXCEPTION 'revoke consent replay conflict'; END IF;
  IF version IS DISTINCT FROM (r->>'expectedVersion')::integer
    OR challenge.reviewed IS DISTINCT FROM public.authority_revoke_review(r->>'operationId',challenge.reviewed->>'reason')
    THEN RAISE EXCEPTION 'stale revoke binding conflict'; END IF;
  SELECT * INTO authority FROM public.authority_lifecycle_outcomes WHERE operation_id=r->>'operationId';
  checked := clock_timestamp();
  IF checked>=challenge.expires_at OR checked>=grant_row.expires_at OR consent.approved_at>checked
    THEN RAISE EXCEPTION 'final revoke consent expired'; END IF;
  proof := jsonb_build_object('operationId',r->>'key','state','REVOKED','revocationScope','authority',
    'authority',authority.proof,'consent',consent.receipt,'executingActor',r->>'actorId','finalCheckedAt',checked);
  UPDATE public.production_readiness_publications SET state='REVOKED' WHERE id=authority.publication_id;
  UPDATE public.production_readiness_promotions SET state='REVOKED',updated_at=checked WHERE id=authority.operation_id;
  UPDATE public.authority_lifecycle_reservations v SET version=v.version+1 WHERE id=authority.reservation_id;
  INSERT INTO public.authority_revoke_outcomes VALUES (r->>'key',r,authority.operation_id,consent.idempotency_key,checked,proof);
  INSERT INTO public.authority_revoke_audits VALUES (r->>'key',r->>'actorId','PROMOTED->REVOKED',proof);
  RETURN r->>'key';
END; $$;
REVOKE ALL ON public.authority_revoke_outcomes,public.authority_revoke_audits FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_authority(JSONB) FROM PUBLIC;
