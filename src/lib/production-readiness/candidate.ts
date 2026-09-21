import { canonicalize, sha256 } from "./canonical";
import { createRefreshPolicy, type RefreshPolicy } from "./refresh-policy";

export const AUTHORITY_CANDIDATE_VERSION = "authority-candidate/v1";
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const FULL_SHA = /^[a-f0-9]{40}$/;

type Release = { releaseId: string; deploymentId: string; fullSha: string; domain: string; target: string; scope: string; validFrom: string; expiresAt: string };
type Baseline = { kind: "real-baseline/v1"; snapshotDigest: string; dataDigest: string; evidence: { kind: "independent-baseline-evidence/v1"; artifactDigest: string; provenance: string }; coverage: { unit: string; expectedUniverse: string; observedCount: string }; watermarks: Record<string, string>; provenance: Record<string, string>; canonicalizationVersion: "os03-c14n/v1" };
export type AuthorityCandidateInput = { release: Release; policy: RefreshPolicy; baseline: Baseline; generatorVersion: string; canonicalizationVersion: "os03-c14n/v1" };
export type AuthorityCandidate = { version: typeof AUTHORITY_CANDIDATE_VERSION; manifestBytes: string; candidateDigest: string; baselineDataDigest: string; policyDigest: string };

export function createAuthorityCandidate(input: AuthorityCandidateInput): AuthorityCandidate {
	if (!input || !("release" in input) || !("baseline" in input)) throw new Error("authority candidate requires a real baseline contract");
	const { release, baseline } = input;
	assertRelease(release);
	assertBaseline(baseline);
	if (input.canonicalizationVersion !== "os03-c14n/v1" || input.generatorVersion !== "authority-candidate-generator/v1") throw new Error("unsupported candidate canonicalization or generator version");
	if (release.releaseId === baseline.dataDigest || release.deploymentId === baseline.dataDigest) throw new Error("release identity must not equal baseline identity");
	const policy = createRefreshPolicy(input.policy);
	const manifestBytes = canonicalize({ version: AUTHORITY_CANDIDATE_VERSION, release, policy, baseline, generatorVersion: input.generatorVersion, canonicalizationVersion: input.canonicalizationVersion });
	return { version: AUTHORITY_CANDIDATE_VERSION, manifestBytes, candidateDigest: sha256(manifestBytes), baselineDataDigest: baseline.dataDigest, policyDigest: policy.digest };
}

export function verifyAuthorityCandidate(candidate: AuthorityCandidate) {
	if (!validCandidateEnvelope(candidate)) return false;
	try {
		const manifest = JSON.parse(candidate.manifestBytes) as Record<string, unknown>;
		return canonicalize(manifest) === candidate.manifestBytes
			&& validManifest(manifest, candidate) && candidate.candidateDigest === sha256(candidate.manifestBytes);
	} catch { return false; }
}

function validCandidateEnvelope(candidate: AuthorityCandidate) {
	return Boolean(candidate && candidate.version === AUTHORITY_CANDIDATE_VERSION && SHA256.test(candidate.candidateDigest));
}

function validManifest(manifest: Record<string, unknown>, candidate: AuthorityCandidate) {
	if (!validManifestHeader(manifest)) return false;
	try { return validManifestContents(manifest, candidate); } catch { return false; }
}

function validManifestHeader(manifest: Record<string, unknown>) {
	return Object.keys(manifest).sort().join(",") === "baseline,canonicalizationVersion,generatorVersion,policy,release,version"
		&& manifest.version === AUTHORITY_CANDIDATE_VERSION && manifest.generatorVersion === "authority-candidate-generator/v1"
		&& manifest.canonicalizationVersion === "os03-c14n/v1";
}

function validManifestContents(manifest: Record<string, unknown>, candidate: AuthorityCandidate) {
	const release = manifest.release as Release;
	const baseline = manifest.baseline as Baseline;
	const policy = manifest.policy as { version?: "refresh-policy/v1"; bytes?: string; digest?: string };
	assertRelease(release); assertBaseline(baseline);
	return validManifestPolicy(policy, candidate) && baseline.dataDigest === candidate.baselineDataDigest
		&& SHA256.test(candidate.baselineDataDigest);
}

function validManifestPolicy(policy: { version?: "refresh-policy/v1"; bytes?: string; digest?: string }, candidate: AuthorityCandidate) {
	return exactKeys(policy, ["bytes", "digest", "version"]) && typeof policy.bytes === "string"
		&& policy.digest === candidate.policyDigest && SHA256.test(policy.digest)
		&& createRefreshPolicy({ version: policy.version!, bytes: JSON.parse(policy.bytes) }).digest === policy.digest;
}

function assertRelease(release: Release) {
	if (!exactKeys(release, ["deploymentId", "domain", "expiresAt", "fullSha", "releaseId", "scope", "target", "validFrom"])
		|| !FULL_SHA.test(release.fullSha)) throw new Error("release requires a full lowercase commit SHA");
	for (const value of Object.values(release)) if (!value?.trim()) throw new Error("release identity is incomplete");
	const validFrom = Date.parse(release.validFrom), expiresAt = Date.parse(release.expiresAt);
	if (Number.isNaN(validFrom) || Number.isNaN(expiresAt) || validFrom >= expiresAt) throw new Error("candidate validity is invalid");
}

function assertBaseline(baseline: Baseline) {
	assertBaselineShape(baseline);
	assertBaselineDigests(baseline);
	assertBaselineCompleteness(baseline);
}

function assertBaselineShape(baseline: Baseline) {
	if (!exactKeys(baseline, ["canonicalizationVersion", "coverage", "dataDigest", "evidence", "kind", "provenance", "snapshotDigest", "watermarks"])
		|| !exactKeys(baseline.evidence, ["artifactDigest", "kind", "provenance"])
		|| !exactKeys(baseline.coverage, ["expectedUniverse", "observedCount", "unit"])
		|| baseline.kind !== "real-baseline/v1" || baseline.canonicalizationVersion !== "os03-c14n/v1" || baseline.evidence?.kind !== "independent-baseline-evidence/v1") throw new Error("fixture or unsupported baseline evidence");
}

function assertBaselineDigests(baseline: Baseline) {
	for (const digest of [baseline.snapshotDigest, baseline.dataDigest, baseline.evidence.artifactDigest]) if (!SHA256.test(digest)) throw new Error("baseline requires retained SHA-256 evidence");
}

function assertBaselineCompleteness(baseline: Baseline) {
	if (!baseline.evidence.provenance?.trim() || !baseline.coverage.unit?.trim() || !baseline.coverage.expectedUniverse?.trim()
		|| !/^(?:0|[1-9]\d*)$/.test(baseline.coverage.observedCount)
		|| !completeTextRecord(baseline.watermarks) || !completeTextRecord(baseline.provenance)) throw new Error("baseline coverage or provenance is incomplete");
}

function completeTextRecord(value: Record<string, string>) {
	return Boolean(value) && Object.keys(value).length > 0 && Object.entries(value).every(([key, item]) => key.trim() && item?.trim());
}

function exactKeys(value: object, keys: string[]) {
	return Boolean(value) && Object.keys(value).sort().join(",") === keys.sort().join(",");
}
