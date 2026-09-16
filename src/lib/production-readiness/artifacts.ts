import { createHash } from "node:crypto";

const RETENTION_DAYS = 180;
const REQUIRED_MEASUREMENTS = ["integrity", "capacity"] as const;
type Measurement = { name: "integrity" | "capacity"; owner: string };

type CustodyInput = {
	bytes: string;
	expectedSha256?: string;
	now: Date;
	references?: Array<{ expiresAt: Date; revokedAt?: Date }>;
	holdUntil?: Date;
	dependencies?: string[];
	measurements?: Measurement[];
	restore?: { integrity: boolean; privileges: boolean };
};

export function assessCustody(input: CustodyInput) {
	const digest = createHash("sha256").update(input.bytes).digest("hex");
	const corrupt = Boolean(input.expectedSha256 && input.expectedSha256 !== digest);
	const latestExpiry = input.references?.reduce<Date | undefined>((latest, reference) =>
		!latest || reference.expiresAt > latest ? reference.expiresAt : latest, undefined);
	const retainUntil = latestExpiry
		? new Date(latestExpiry.getTime() + RETENTION_DAYS * 86_400_000)
		: input.now;
	const held = Boolean(input.holdUntil && input.holdUntil > input.now);
	const measured = new Set((input.measurements ?? []).filter(({ owner }) => owner.trim()).map(({ name }) => name));
	const restoreProven = !input.restore || (input.restore.integrity && input.restore.privileges);
	return {
		retainUntil,
		restrictions: corrupt ? [...new Set(input.dependencies ?? [])].sort() : [],
		deleteable: !corrupt && !held && input.now > retainUntil,
		enablementBlocked: corrupt || !restoreProven || REQUIRED_MEASUREMENTS.some((name) => !measured.has(name)),
	};
}

export function createCustodySchemaSql() {
	return `
CREATE TABLE public.evidence_artifacts (
  id TEXT PRIMARY KEY, bytes BYTEA NOT NULL, sha256 TEXT NOT NULL,
  integrity_status TEXT NOT NULL DEFAULT 'CLEAR' CHECK (integrity_status IN ('CLEAR','CORRUPT','MISSING')),
  retain_until TIMESTAMPTZ NOT NULL
);
CREATE TABLE public.evidence_references (artifact_id TEXT NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, authority_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, PRIMARY KEY (artifact_id, authority_id));
CREATE TABLE public.evidence_holds (artifact_id TEXT PRIMARY KEY REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, hold_until TIMESTAMPTZ NOT NULL);
CREATE TABLE public.evidence_dependencies (artifact_id TEXT NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, dependent_id TEXT NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, PRIMARY KEY (artifact_id, dependent_id));
CREATE TABLE public.evidence_restrictions (artifact_id TEXT NOT NULL REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, dependent_id TEXT NOT NULL, PRIMARY KEY (artifact_id, dependent_id));
CREATE TABLE public.evidence_measurements (name TEXT PRIMARY KEY CHECK (name IN ('integrity','capacity')), owner TEXT NOT NULL CHECK (btrim(owner) <> ''), proven_at TIMESTAMPTZ NOT NULL);
CREATE TABLE public.evidence_retention_receipts (artifact_id TEXT PRIMARY KEY REFERENCES public.evidence_artifacts(id) ON DELETE RESTRICT, retain_until TIMESTAMPTZ NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp());
CREATE FUNCTION public.evidence_gc(p_limit INTEGER) RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE deleted_count INTEGER; BEGIN
  WITH eligible AS (SELECT a.id,a.ctid FROM public.evidence_artifacts a WHERE a.integrity_status='CLEAR' AND a.retain_until < clock_timestamp() AND NOT EXISTS (SELECT 1 FROM public.evidence_references r WHERE r.artifact_id=a.id AND r.expires_at + interval '180 days' >= clock_timestamp()) AND NOT EXISTS (SELECT 1 FROM public.evidence_holds h WHERE h.artifact_id=a.id AND h.hold_until >= clock_timestamp()) LIMIT p_limit FOR UPDATE SKIP LOCKED),
  retired AS (DELETE FROM public.evidence_dependencies d USING eligible parent,eligible child WHERE d.artifact_id=parent.id AND d.dependent_id=child.id RETURNING d.artifact_id,d.dependent_id),
  chosen AS (SELECT e.ctid FROM eligible e WHERE NOT EXISTS (SELECT 1 FROM public.evidence_dependencies d WHERE (d.artifact_id=e.id OR d.dependent_id=e.id) AND NOT EXISTS (SELECT 1 FROM retired r WHERE r.artifact_id=d.artifact_id AND r.dependent_id=d.dependent_id)) LIMIT p_limit)
  DELETE FROM public.evidence_artifacts a USING chosen WHERE a.ctid=chosen.ctid; GET DIAGNOSTICS deleted_count = ROW_COUNT; RETURN deleted_count;
END; $$;`;
}
