-- U7: postcommit source verification seals source-only proof; it cannot promote public facts.
CREATE TABLE public.delta_verifications (
  id TEXT PRIMARY KEY, source_operation_id TEXT NOT NULL UNIQUE REFERENCES public.source_capture_operations(id) ON DELETE RESTRICT,
  verifier_credential TEXT NOT NULL, committed_snapshot TEXT NOT NULL CHECK (committed_snapshot LIKE 'committed:%'),
  policy_digest TEXT NOT NULL, predecessor_digest TEXT NOT NULL, result_digest TEXT NOT NULL,
  evidence_artifact_id TEXT NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT,
  observed_at TIMESTAMPTZ NOT NULL, verified_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SEALED_SOURCE_ONLY','REJECTED')),
  CHECK (verified_at >= observed_at)
);
CREATE FUNCTION public.seal_source_verification(p_id TEXT, p_operation_id TEXT, p_credential TEXT, p_snapshot TEXT, p_policy TEXT, p_predecessor TEXT, p_result TEXT, p_evidence TEXT, p_observed TIMESTAMPTZ, p_verified TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF p_credential <> 'verifier/read-only' OR p_snapshot NOT LIKE 'committed:%' THEN RAISE EXCEPTION 'independent committed verifier required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.source_capture_operations WHERE id=p_operation_id) THEN RAISE EXCEPTION 'unknown source lineage'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.source_capture_items WHERE operation_id=p_operation_id) THEN RAISE EXCEPTION 'missing source observations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.evidence_artifacts WHERE id=p_evidence AND integrity_status='CLEAR') THEN RAISE EXCEPTION 'missing or corrupt evidence'; END IF;
  IF p_verified < p_observed THEN RAISE EXCEPTION 'verification cannot rejuvenate source observations'; END IF;
  INSERT INTO public.delta_verifications VALUES (p_id,p_operation_id,p_credential,p_snapshot,p_policy,p_predecessor,p_result,p_evidence,p_observed,p_verified,'SEALED_SOURCE_ONLY');
  RETURN p_id;
END; $$;
