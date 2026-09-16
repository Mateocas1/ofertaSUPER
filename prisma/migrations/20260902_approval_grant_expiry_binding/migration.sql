-- U9c: retain the approving grant's original expiry; legacy unbound rows remain ineligible for recovery.
ALTER TABLE public.approval_challenges ADD COLUMN grant_expires_at TIMESTAMPTZ;
ALTER TABLE public.approval_receipts ADD COLUMN grant_expires_at TIMESTAMPTZ;

CREATE FUNCTION public.reject_approval_challenge_expiry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.grant_expires_at IS DISTINCT FROM NEW.grant_expires_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    RAISE EXCEPTION 'approval expiry binding is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE FUNCTION public.reject_approval_receipt_expiry_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.grant_expires_at IS DISTINCT FROM NEW.grant_expires_at THEN
    RAISE EXCEPTION 'approval expiry binding is immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER approval_challenges_expiry_immutable BEFORE UPDATE ON public.approval_challenges
  FOR EACH ROW EXECUTE FUNCTION public.reject_approval_challenge_expiry_mutation();
CREATE TRIGGER approval_receipts_grant_expiry_immutable BEFORE UPDATE ON public.approval_receipts
  FOR EACH ROW EXECUTE FUNCTION public.reject_approval_receipt_expiry_mutation();

DROP FUNCTION public.consume_approval_challenge(TEXT);
CREATE FUNCTION public.consume_approval_challenge(p_id TEXT)
RETURNS TABLE(id TEXT, nonce_hash TEXT, csrf_hash TEXT, user_id TEXT, session_id TEXT, request_digest TEXT,
  expires_at TIMESTAMPTZ, grant_expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ)
LANGUAGE sql AS $$
  UPDATE public.approval_challenges
  SET consumed_at = clock_timestamp()
  WHERE approval_challenges.id = p_id
    AND approval_challenges.consumed_at IS NULL
    AND approval_challenges.expires_at > clock_timestamp()
    AND approval_challenges.grant_expires_at IS NOT NULL
  RETURNING approval_challenges.id, approval_challenges.nonce_hash, approval_challenges.csrf_hash,
    approval_challenges.user_id, approval_challenges.session_id, approval_challenges.request_digest,
    approval_challenges.expires_at, approval_challenges.grant_expires_at, approval_challenges.consumed_at;
$$;

DROP FUNCTION public.create_approval_challenge(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ);
CREATE FUNCTION public.create_approval_challenge(p_candidate_admission_id TEXT, p_id TEXT, p_nonce_hash TEXT,
  p_csrf_hash TEXT, p_user_id TEXT, p_session_id TEXT, p_request_digest TEXT, p_expires_at TIMESTAMPTZ,
  p_grant_expires_at TIMESTAMPTZ)
RETURNS TABLE(id TEXT, candidate_admission_id TEXT, candidate_verification_id TEXT, reviewed_payload_bytes TEXT,
  reviewed_payload_digest TEXT, grant_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE admission RECORD;
BEGIN
  SELECT * INTO admission FROM public.resolve_eligible_candidate_admission(p_candidate_admission_id);
  IF admission IS NULL THEN RAISE EXCEPTION 'eligible candidate admission is required'; END IF;
  IF p_expires_at > admission.deadline_at OR p_expires_at > admission.expires_at
    OR p_expires_at > p_grant_expires_at THEN
    RAISE EXCEPTION 'approval challenge deadline exceeds immutable binding';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.publication_grants publication_grant
    JOIN public.authority_candidates candidate ON candidate.id = p_candidate_admission_id
    JOIN public.refresh_policies policy ON policy.id = candidate.policy_id
    WHERE publication_grant.user_id = p_user_id AND publication_grant.action = 'approve' AND publication_grant.scope = candidate.scope
      AND publication_grant.target = candidate.target AND publication_grant.policy_digest = policy.digest
      AND publication_grant.revoked_at IS NULL AND publication_grant.expires_at = p_grant_expires_at
      AND publication_grant.expires_at > clock_timestamp()
  ) THEN RAISE EXCEPTION 'live matching approving grant is required'; END IF;
  INSERT INTO public.approval_challenges (id, nonce_hash, csrf_hash, user_id, session_id, request_digest, expires_at,
    grant_expires_at, candidate_admission_id, candidate_verification_id, reviewed_payload_bytes, reviewed_payload_digest)
  VALUES (p_id, p_nonce_hash, p_csrf_hash, p_user_id, p_session_id, p_request_digest, p_expires_at,
    p_grant_expires_at, admission.candidate_admission_id, admission.verification_id, admission.candidate_manifest_bytes,
    admission.candidate_manifest_digest);
  RETURN QUERY SELECT p_id, admission.candidate_admission_id, admission.verification_id,
    admission.candidate_manifest_bytes, admission.candidate_manifest_digest, p_grant_expires_at;
END; $$;

DROP FUNCTION public.record_candidate_approval_receipt(TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT);
CREATE FUNCTION public.record_candidate_approval_receipt(p_idempotency_key TEXT, p_request_digest TEXT, p_actor_id TEXT,
  p_approved_at TIMESTAMPTZ, p_challenge_id TEXT)
RETURNS TABLE(idempotency_key TEXT, request_digest TEXT, actor_id TEXT, approved_at TIMESTAMPTZ,
  grant_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE existing public.approval_receipts%ROWTYPE; challenge public.approval_challenges%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM public.approval_challenges WHERE id = p_challenge_id AND consumed_at IS NOT NULL
    AND approval_challenges.grant_expires_at IS NOT NULL;
  IF challenge IS NULL THEN RAISE EXCEPTION 'consumed approval challenge is required'; END IF;
  IF challenge.request_digest <> p_request_digest OR challenge.user_id <> p_actor_id THEN
    RAISE EXCEPTION 'approval receipt binding conflict';
  END IF;
  INSERT INTO public.approval_receipts (idempotency_key, request_digest, actor_id, approved_at, grant_expires_at,
    candidate_admission_id, candidate_verification_id, reviewed_payload_bytes, reviewed_payload_digest)
  VALUES (p_idempotency_key, p_request_digest, p_actor_id, p_approved_at, challenge.grant_expires_at,
    challenge.candidate_admission_id, challenge.candidate_verification_id, challenge.reviewed_payload_bytes,
    challenge.reviewed_payload_digest)
  ON CONFLICT ON CONSTRAINT approval_receipts_pkey DO NOTHING;
  SELECT * INTO existing FROM public.approval_receipts WHERE approval_receipts.idempotency_key = p_idempotency_key;
  IF existing.request_digest <> p_request_digest OR existing.grant_expires_at <> challenge.grant_expires_at
    OR existing.candidate_admission_id <> challenge.candidate_admission_id
    OR existing.candidate_verification_id <> challenge.candidate_verification_id
    OR existing.reviewed_payload_digest <> challenge.reviewed_payload_digest THEN
    RAISE EXCEPTION 'approval receipt idempotency conflict';
  END IF;
  RETURN QUERY SELECT existing.idempotency_key, existing.request_digest, existing.actor_id, existing.approved_at,
    existing.grant_expires_at;
END; $$;
