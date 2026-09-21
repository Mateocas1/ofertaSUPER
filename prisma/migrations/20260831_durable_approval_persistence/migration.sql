-- U9a: durable approval persistence only. These objects cannot reserve, publish, or activate authority.
CREATE TABLE public.publication_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'approve'),
  scope TEXT NOT NULL CHECK (length(scope) > 0),
  target TEXT NOT NULL CHECK (length(target) > 0),
  policy_digest TEXT NOT NULL CHECK (policy_digest LIKE 'sha256:%'),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (revoked_at IS NULL OR revoked_at <= expires_at)
);
CREATE INDEX publication_grants_lookup ON public.publication_grants (user_id, action, scope, target, policy_digest, expires_at);

CREATE TABLE public.approval_challenges (
  id TEXT PRIMARY KEY,
  nonce_hash TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);
CREATE INDEX approval_challenges_lookup ON public.approval_challenges (user_id, session_id, expires_at);

CREATE TABLE public.approval_receipts (
  idempotency_key TEXT PRIMARY KEY,
  request_digest TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION public.consume_approval_challenge(p_id TEXT)
RETURNS TABLE(id TEXT, nonce_hash TEXT, csrf_hash TEXT, user_id TEXT, session_id TEXT, request_digest TEXT, expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ)
LANGUAGE sql AS $$
  UPDATE public.approval_challenges
  SET consumed_at = clock_timestamp()
  WHERE approval_challenges.id = p_id
    AND approval_challenges.consumed_at IS NULL
    AND approval_challenges.expires_at > clock_timestamp()
  RETURNING approval_challenges.id, approval_challenges.nonce_hash, approval_challenges.csrf_hash,
    approval_challenges.user_id, approval_challenges.session_id, approval_challenges.request_digest,
    approval_challenges.expires_at, approval_challenges.consumed_at;
$$;

CREATE FUNCTION public.record_approval_receipt(p_idempotency_key TEXT, p_request_digest TEXT, p_actor_id TEXT, p_approved_at TIMESTAMPTZ)
RETURNS TABLE(idempotency_key TEXT, request_digest TEXT, actor_id TEXT, approved_at TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE existing public.approval_receipts%ROWTYPE;
BEGIN
  INSERT INTO public.approval_receipts (idempotency_key, request_digest, actor_id, approved_at)
  VALUES (p_idempotency_key, p_request_digest, p_actor_id, p_approved_at)
  ON CONFLICT ON CONSTRAINT approval_receipts_pkey DO NOTHING;
  SELECT * INTO existing FROM public.approval_receipts WHERE approval_receipts.idempotency_key = p_idempotency_key;
  IF existing.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'approval receipt idempotency conflict';
  END IF;
  RETURN QUERY SELECT existing.idempotency_key, existing.request_digest, existing.actor_id, existing.approved_at;
END; $$;
