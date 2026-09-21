-- U3c: immutable candidate technical admission; no authority, reservation, or publication effect.
CREATE TABLE public.refresh_policies (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL CHECK (version = 'refresh-policy/v1'),
  canonical_bytes TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE CHECK (digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.baseline_manifests (
  id TEXT PRIMARY KEY,
  canonical_bytes TEXT NOT NULL,
  digest TEXT NOT NULL UNIQUE CHECK (digest ~ '^sha256:[a-f0-9]{64}$'),
  build_epoch BIGINT NOT NULL CHECK (build_epoch >= 0),
  root_digest TEXT NOT NULL CHECK (root_digest ~ '^sha256:[a-f0-9]{64}$'),
  snapshot_digest TEXT NOT NULL CHECK (snapshot_digest ~ '^sha256:[a-f0-9]{64}$'),
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[a-f0-9]{64}$'),
  coverage_bytes TEXT NOT NULL,
  watermarks_bytes TEXT NOT NULL,
  provenance_bytes TEXT NOT NULL,
  custody_refs_bytes TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.authority_candidates (
  id TEXT PRIMARY KEY,
  manifest_bytes TEXT NOT NULL,
  manifest_digest TEXT NOT NULL UNIQUE CHECK (manifest_digest ~ '^sha256:[a-f0-9]{64}$'),
  version TEXT NOT NULL CHECK (version = 'authority-candidate/v1'),
  release_id TEXT NOT NULL CHECK (length(release_id) > 0),
  deployment_id TEXT NOT NULL CHECK (length(deployment_id) > 0),
  full_sha TEXT NOT NULL CHECK (full_sha ~ '^[a-f0-9]{40}$'),
  domain TEXT NOT NULL CHECK (length(domain) > 0),
  target TEXT NOT NULL CHECK (length(target) > 0),
  scope TEXT NOT NULL CHECK (length(scope) > 0),
  valid_from TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  policy_id TEXT NOT NULL REFERENCES public.refresh_policies(id) ON DELETE RESTRICT,
  baseline_manifest_id TEXT NOT NULL REFERENCES public.baseline_manifests(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (valid_from < expires_at)
);

CREATE TABLE public.candidate_technical_verifications (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES public.authority_candidates(id) ON DELETE RESTRICT,
  verifier_id TEXT NOT NULL CHECK (length(verifier_id) > 0),
  verifier_class TEXT NOT NULL CHECK (length(verifier_class) > 0),
  result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  evidence_bytes TEXT NOT NULL,
  evidence_digest TEXT NOT NULL CHECK (evidence_digest ~ '^sha256:[a-f0-9]{64}$'),
  verified_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (verified_at < deadline_at),
  CHECK ((result = 'PASS' AND failure_reason IS NULL) OR (result = 'FAIL' AND failure_reason IS NOT NULL))
);
CREATE INDEX candidate_technical_verifications_eligible ON public.candidate_technical_verifications (candidate_id, result, deadline_at);

CREATE FUNCTION public.reject_candidate_admission_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'candidate admission records are immutable'; END; $$;
CREATE TRIGGER refresh_policies_immutable BEFORE UPDATE OR DELETE ON public.refresh_policies FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER baseline_manifests_immutable BEFORE UPDATE OR DELETE ON public.baseline_manifests FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER authority_candidates_immutable BEFORE UPDATE OR DELETE ON public.authority_candidates FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();
CREATE TRIGGER candidate_technical_verifications_immutable BEFORE UPDATE OR DELETE ON public.candidate_technical_verifications FOR EACH ROW EXECUTE FUNCTION public.reject_candidate_admission_mutation();

ALTER TABLE public.approval_challenges
  ADD COLUMN candidate_admission_id TEXT NOT NULL REFERENCES public.authority_candidates(id) ON DELETE RESTRICT,
  ADD COLUMN candidate_verification_id TEXT NOT NULL REFERENCES public.candidate_technical_verifications(id) ON DELETE RESTRICT,
  ADD COLUMN reviewed_payload_bytes TEXT NOT NULL,
  ADD COLUMN reviewed_payload_digest TEXT NOT NULL CHECK (reviewed_payload_digest ~ '^sha256:[a-f0-9]{64}$');
ALTER TABLE public.approval_receipts
  ADD COLUMN candidate_admission_id TEXT NOT NULL REFERENCES public.authority_candidates(id) ON DELETE RESTRICT,
  ADD COLUMN candidate_verification_id TEXT NOT NULL REFERENCES public.candidate_technical_verifications(id) ON DELETE RESTRICT,
  ADD COLUMN reviewed_payload_bytes TEXT NOT NULL,
  ADD COLUMN reviewed_payload_digest TEXT NOT NULL CHECK (reviewed_payload_digest ~ '^sha256:[a-f0-9]{64}$');

CREATE FUNCTION public.create_approval_challenge(p_candidate_admission_id TEXT, p_id TEXT, p_nonce_hash TEXT,
  p_csrf_hash TEXT, p_user_id TEXT, p_session_id TEXT, p_request_digest TEXT, p_expires_at TIMESTAMPTZ)
RETURNS TABLE(id TEXT, candidate_admission_id TEXT, candidate_verification_id TEXT, reviewed_payload_bytes TEXT,
  reviewed_payload_digest TEXT)
LANGUAGE plpgsql AS $$
DECLARE admission RECORD;
BEGIN
  SELECT * INTO admission FROM public.resolve_eligible_candidate_admission(p_candidate_admission_id);
  IF admission IS NULL THEN RAISE EXCEPTION 'eligible candidate admission is required'; END IF;
  IF p_expires_at > admission.deadline_at OR p_expires_at > admission.expires_at THEN RAISE EXCEPTION 'approval challenge deadline exceeds admission'; END IF;
  INSERT INTO public.approval_challenges (id, nonce_hash, csrf_hash, user_id, session_id, request_digest, expires_at,
    candidate_admission_id, candidate_verification_id, reviewed_payload_bytes, reviewed_payload_digest)
  VALUES (p_id, p_nonce_hash, p_csrf_hash, p_user_id, p_session_id, p_request_digest, p_expires_at,
    admission.candidate_admission_id, admission.verification_id, admission.candidate_manifest_bytes,
    admission.candidate_manifest_digest);
  RETURN QUERY SELECT p_id, admission.candidate_admission_id, admission.verification_id,
    admission.candidate_manifest_bytes, admission.candidate_manifest_digest;
END; $$;

CREATE FUNCTION public.record_candidate_approval_receipt(p_idempotency_key TEXT, p_request_digest TEXT, p_actor_id TEXT,
  p_approved_at TIMESTAMPTZ, p_challenge_id TEXT)
RETURNS TABLE(idempotency_key TEXT, request_digest TEXT, actor_id TEXT, approved_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE existing public.approval_receipts%ROWTYPE; challenge public.approval_challenges%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM public.approval_challenges WHERE id = p_challenge_id AND consumed_at IS NOT NULL;
  IF challenge IS NULL THEN RAISE EXCEPTION 'consumed approval challenge is required'; END IF;
  IF challenge.request_digest <> p_request_digest OR challenge.user_id <> p_actor_id THEN RAISE EXCEPTION 'approval receipt binding conflict'; END IF;
  INSERT INTO public.approval_receipts (idempotency_key, request_digest, actor_id, approved_at, candidate_admission_id,
    candidate_verification_id, reviewed_payload_bytes, reviewed_payload_digest)
  VALUES (p_idempotency_key, p_request_digest, p_actor_id, p_approved_at, challenge.candidate_admission_id,
    challenge.candidate_verification_id, challenge.reviewed_payload_bytes, challenge.reviewed_payload_digest)
  ON CONFLICT ON CONSTRAINT approval_receipts_pkey DO NOTHING;
  SELECT * INTO existing FROM public.approval_receipts WHERE approval_receipts.idempotency_key = p_idempotency_key;
  IF existing.request_digest <> p_request_digest OR existing.candidate_admission_id <> challenge.candidate_admission_id
    OR existing.candidate_verification_id <> challenge.candidate_verification_id
    OR existing.reviewed_payload_digest <> challenge.reviewed_payload_digest THEN
    RAISE EXCEPTION 'approval receipt idempotency conflict';
  END IF;
  RETURN QUERY SELECT existing.idempotency_key, existing.request_digest, existing.actor_id, existing.approved_at;
END; $$;

CREATE FUNCTION public.resolve_eligible_candidate_admission(p_candidate_admission_id TEXT)
RETURNS TABLE(candidate_admission_id TEXT, candidate_manifest_bytes TEXT, candidate_manifest_digest TEXT,
  candidate_version TEXT, verification_id TEXT, verification_result TEXT, verification_evidence_bytes TEXT,
  verification_evidence_digest TEXT, verifier_id TEXT, verifier_class TEXT, verified_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ, expires_at TIMESTAMPTZ)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.manifest_bytes, c.manifest_digest, c.version, v.id, v.result, v.evidence_bytes,
    v.evidence_digest, v.verifier_id, v.verifier_class, v.verified_at, v.deadline_at, c.expires_at
  FROM public.authority_candidates c
  JOIN public.candidate_technical_verifications v ON v.candidate_id = c.id
  WHERE c.id = p_candidate_admission_id
    AND c.valid_from <= clock_timestamp() AND c.expires_at > clock_timestamp()
    AND v.result = 'PASS' AND v.revoked_at IS NULL AND v.deadline_at > clock_timestamp();
$$;
