-- U5: retained evidence is fail-closed, reference-bound, and custodian-GC only.
CREATE TABLE public.evidence_artifacts (
  "id" TEXT PRIMARY KEY, "bytes" BYTEA NOT NULL, "sha256" TEXT NOT NULL,
  "integrity_status" TEXT NOT NULL DEFAULT 'CLEAR' CHECK ("integrity_status" IN ('CLEAR','CORRUPT','MISSING')),
  "retain_until" TIMESTAMPTZ NOT NULL
);
CREATE TABLE public.evidence_references (
  "artifact_id" TEXT NOT NULL REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT,
  "authority_id" TEXT NOT NULL, "expires_at" TIMESTAMPTZ NOT NULL, "revoked_at" TIMESTAMPTZ,
  PRIMARY KEY ("artifact_id", "authority_id")
);
CREATE TABLE public.evidence_holds ("artifact_id" TEXT PRIMARY KEY REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT, "hold_until" TIMESTAMPTZ NOT NULL);
CREATE TABLE public.evidence_dependencies ("artifact_id" TEXT NOT NULL REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT, "dependent_id" TEXT NOT NULL REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT, PRIMARY KEY ("artifact_id", "dependent_id"));
CREATE TABLE public.evidence_restrictions ("artifact_id" TEXT NOT NULL REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT, "dependent_id" TEXT NOT NULL, PRIMARY KEY ("artifact_id", "dependent_id"));
CREATE TABLE public.evidence_measurements ("name" TEXT PRIMARY KEY CHECK ("name" IN ('integrity','capacity')), "owner" TEXT NOT NULL CHECK (btrim("owner") <> ''), "proven_at" TIMESTAMPTZ NOT NULL);
CREATE TABLE public.evidence_retention_receipts ("artifact_id" TEXT PRIMARY KEY REFERENCES public.evidence_artifacts("id") ON DELETE RESTRICT, "retain_until" TIMESTAMPTZ NOT NULL, "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());

CREATE FUNCTION public.restrict_corrupt_evidence(p_artifact_id TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.evidence_artifacts SET "integrity_status"='CORRUPT' WHERE "id"=p_artifact_id;
  INSERT INTO public.evidence_restrictions
  WITH RECURSIVE closure(id) AS (SELECT p_artifact_id UNION SELECT d."dependent_id" FROM public.evidence_dependencies d JOIN closure c ON d."artifact_id"=c.id)
  SELECT p_artifact_id,id FROM closure ON CONFLICT DO NOTHING;
END; $$;
CREATE FUNCTION public.seal_evidence_retention(p_artifact_id TEXT) RETURNS TIMESTAMPTZ LANGUAGE plpgsql AS $$
DECLARE deadline TIMESTAMPTZ; BEGIN
  SELECT max("expires_at") + interval '180 days' INTO deadline FROM public.evidence_references WHERE "artifact_id"=p_artifact_id;
  UPDATE public.evidence_artifacts SET "retain_until"=greatest("retain_until",coalesce(deadline,"retain_until")) WHERE "id"=p_artifact_id RETURNING "retain_until" INTO deadline;
  IF NOT FOUND THEN RAISE EXCEPTION 'evidence artifact is missing'; END IF;
  INSERT INTO public.evidence_retention_receipts VALUES (p_artifact_id,deadline,clock_timestamp()) ON CONFLICT ("artifact_id") DO UPDATE SET "retain_until"=EXCLUDED."retain_until", "recorded_at"=EXCLUDED."recorded_at";
  RETURN deadline;
END; $$;
CREATE FUNCTION public.evidence_gc(p_limit INTEGER) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE deleted_count INTEGER; BEGIN
  WITH eligible AS (SELECT a.id,a.ctid FROM public.evidence_artifacts a WHERE a.integrity_status='CLEAR' AND a.retain_until < clock_timestamp() AND NOT EXISTS (SELECT 1 FROM public.evidence_references r WHERE r.artifact_id=a.id AND r.expires_at + interval '180 days' >= clock_timestamp()) AND NOT EXISTS (SELECT 1 FROM public.evidence_holds h WHERE h.artifact_id=a.id AND h.hold_until >= clock_timestamp()) LIMIT p_limit FOR UPDATE SKIP LOCKED),
  retired AS (DELETE FROM public.evidence_dependencies d USING eligible parent,eligible child WHERE d.artifact_id=parent.id AND d.dependent_id=child.id RETURNING d.artifact_id,d.dependent_id),
  chosen AS (SELECT e.ctid FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM public.evidence_dependencies d WHERE (d.artifact_id=e.id OR d.dependent_id=e.id) AND NOT EXISTS (SELECT 1 FROM retired r WHERE r.artifact_id=d.artifact_id AND r.dependent_id=d.dependent_id)) LIMIT p_limit)
  DELETE FROM public.evidence_artifacts a USING chosen WHERE a.ctid=chosen.ctid; GET DIAGNOSTICS deleted_count = ROW_COUNT; RETURN deleted_count;
END; $$;
