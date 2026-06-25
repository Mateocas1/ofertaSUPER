import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

type GateStatus = "PASS" | "FAIL";
type Role = "candidateAudit" | "catalogSnapshot" | "comparisonReport";

export type Issue334ArtifactManifestEntry = { role: Role; source: "vea"; issue: 334; path: string; sha256: string; expected: string };
export type TriageCandidate = { source?: string | null; surface?: string | null; identityKind?: string | null; identity?: string | number | null; skuId?: string | number | null; productUrl?: string | null; ean?: string | number | null; name?: string | null; categoryPath?: string | null };
export type TriageClassification = "already_present_alternate_identity" | "equivalent_variant_or_pack" | "source_or_candidate_artifact" | "valid_investigation_candidate" | "insufficient_evidence";
export type TriageClassificationSignals = { sourceOrCandidateArtifact?: boolean; alreadyPresentAlternateIdentity?: boolean; equivalentVariantOrPack?: boolean; validInvestigationCandidate?: boolean; insufficientEvidence?: boolean };
export type TriageSamplingResult = ReturnType<typeof selectDeterministicCategoryPathSample>;
export type TriageReviewRecord = { sampleIndex: number; candidateIdentity: string; classification: TriageClassification; followUpReason?: string | null; evidenceRefs?: string[] };
export type NormalizedTriageItem = { sampleIndex: number; candidateIdentity: string; categoryPath: string; classification: TriageClassification; followUpReason: string | null; evidenceRefs: string[] };
export type VeaTriageReport = { schemaVersion: 1; triage: "vea-likely-missing-candidate-calibration"; source: "vea"; issue: 334; approvedOutputIssue: number; surface: "category-pagination"; calibrationOnly: true; decisionGrade: false; sampling: Omit<TriageSamplingResult, "selected">; items: NormalizedTriageItem[]; aggregateCounts: Record<TriageClassification, number>; constraints: string[]; readOnlyPosture: string[] };

export const EXPECTED_ISSUE_334_ARTIFACT_MANIFEST = [
	{ role: "candidateAudit", source: "vea", issue: 334, path: "audit/coverage/issue-334/vea/category-pagination/category-pagination-audit.json", sha256: "7dee0acb4c151715c566e7ebaa15e358b5258ec9395e22fff2cedabb0ca9d359", expected: "comparison input; 732 total candidates" },
	{ role: "catalogSnapshot", source: "vea", issue: 334, path: "audit/catalog-snapshots/issue-334/vea/catalog-identities.json", sha256: "ed9c7bee429cfbd5946aace64b10bd43916c0b8d395528f10408eeb4df0ef358", expected: "comparison input" },
	{ role: "comparisonReport", source: "vea", issue: 334, path: "audit/catalog-comparison/issue-334/vea/category-pagination/category-pagination-catalog-comparison.json", sha256: "57f504581b7326516b020c3301bde69732b53a31ae959a55051b5ec8524e0396", expected: "total 732, known 97, likelyMissing 635, duplicate/conflict/insufficient 0, confidence PASS" },
] as const satisfies readonly Issue334ArtifactManifestEntry[];

export const TRIAGE_CLASSIFICATIONS = ["already_present_alternate_identity", "equivalent_variant_or_pack", "source_or_candidate_artifact", "valid_investigation_candidate", "insufficient_evidence"] as const satisfies readonly TriageClassification[];
export const TRIAGE_CLASSIFICATION_PRECEDENCE = ["source_or_candidate_artifact", "already_present_alternate_identity", "equivalent_variant_or_pack", "valid_investigation_candidate", "insufficient_evidence"] as const satisfies readonly TriageClassification[];

const SOURCE = "vea";
const SURFACE = "category-pagination";
const FORBIDDEN_FLAGS = ["--apply", "--write", "--confirm", "--execute", "--delete", "--scheduler", "--all-source", "--all-sources", "--deploy", "--migrations", "--purge-cache", "--cache-purge", "--production", "--live", "--ingest", "--stage", "--refresh", "--reconcile", "--cron", "--workflow", "--cleanup"];

export function verifyIssue334ArtifactManifest(artifacts: Record<string, string | Buffer>, manifest: readonly Issue334ArtifactManifestEntry[] = EXPECTED_ISSUE_334_ARTIFACT_MANIFEST) {
	const failClosedReasons: string[] = [];
	const inputs = manifest.map((entry) => {
		const content = artifacts[entry.path];
		const present = content !== undefined;
		const actualSha256 = present ? sha256Hex(content) : null;
		if (!present) failClosedReasons.push(`missing ${entry.role} artifact at ${entry.path}`);
		else if (actualSha256 !== entry.sha256) failClosedReasons.push(`${entry.role} sha256 mismatch at ${entry.path}: expected ${entry.sha256}, got ${actualSha256}`);
		return { ...entry, present, actualSha256 };
	});
	return { status: (failClosedReasons.length ? "FAIL" : "PASS") as GateStatus, inputs, failClosedReasons };
}

export function selectDeterministicCategoryPathSample(candidates: TriageCandidate[], options: { seed: string; requestedSize?: number }) {
	const requestedSize = options.requestedSize ?? 50;
	if (!options.seed.trim()) throw new Error("Vea triage sampling requires a deterministic seed");
	if (!Number.isInteger(requestedSize) || requestedSize <= 0) throw new Error("Vea triage sampling requires a positive requested size");
	const constraints: string[] = [];
	const strata = new Map<string, Array<{ candidate: TriageCandidate; identity: string }>>();
	let missingCategoryPath = 0;
	for (const candidate of candidates) {
		if (text(candidate.source) && text(candidate.source) !== SOURCE) continue;
		if (candidate.surface && text(candidate.surface) !== SURFACE) continue;
		const categoryPath = text(candidate.categoryPath);
		if (!categoryPath) { missingCategoryPath += 1; continue; }
		strata.set(categoryPath, [...(strata.get(categoryPath) ?? []), { candidate, identity: canonicalIdentity(candidate) }]);
	}
	if (missingCategoryPath) constraints.push(`excluded ${missingCategoryPath} candidates without categoryPath`);
	if (strata.size > requestedSize) constraints.push(`omitted ${strata.size - requestedSize} categoryPath strata because strata exceeded requested sample size ${requestedSize}`);
	const sortedStrata = Array.from(strata.entries()).sort(([left], [right]) => left.localeCompare(right));
	const eligibleCount = sortedStrata.reduce((sum, [, rows]) => sum + rows.length, 0);
	const targetSize = Math.min(requestedSize, eligibleCount);
	if (eligibleCount < requestedSize) constraints.push(`eligible candidates shortfall: selected ${eligibleCount} of requested ${requestedSize}`);
	const allocations = allocateStrata(sortedStrata, targetSize, options.seed);
	const selected = sortedStrata.flatMap(([categoryPath, rows]) => orderRows(rows, options.seed, categoryPath).slice(0, allocations.get(categoryPath) ?? 0).map((entry) => ({ categoryPath, ...entry })));
	return {
		seed: options.seed,
		requestedSize,
		selectedSize: selected.length,
		selected: selected.map((entry, index) => ({ sampleIndex: index + 1, candidateIdentity: entry.identity, categoryPath: entry.categoryPath, candidate: entry.candidate })),
		strata: sortedStrata.map(([categoryPath, rows]) => ({ categoryPath, eligibleCount: rows.length, selectedCount: allocations.get(categoryPath) ?? 0, omittedCount: rows.length - (allocations.get(categoryPath) ?? 0) })),
		constraints,
	};
}

export function resolveTriageClassification(signals: TriageClassificationSignals): TriageClassification {
	if (signals.sourceOrCandidateArtifact) return "source_or_candidate_artifact";
	if (signals.alreadyPresentAlternateIdentity) return "already_present_alternate_identity";
	if (signals.equivalentVariantOrPack) return "equivalent_variant_or_pack";
	if (signals.validInvestigationCandidate) return "valid_investigation_candidate";
	return "insufficient_evidence";
}

export function validateTriageClassification(record: { classification?: unknown; followUpReason?: unknown }) {
	if (!TRIAGE_CLASSIFICATIONS.includes(record.classification as TriageClassification)) throw new Error("Vea triage classification must be exactly one supported taxonomy value");
	return { classification: record.classification as TriageClassification, followUpReason: typeof record.followUpReason === "string" && record.followUpReason.trim() ? record.followUpReason.trim() : null };
}

export function validateApprovedTriageOutputIssue(issue: unknown) {
	if (!Number.isInteger(issue) || (issue as number) <= 0) throw new Error("Vea triage requires an approved output issue number");
	return issue as number;
}

export function buildTriageOutputPath({ issue, fileName }: { issue: unknown; fileName: string }) {
	return `audit/triage/issue-${validateApprovedTriageOutputIssue(issue)}/vea/category-pagination/${safeOutputFileName(fileName)}`;
}

export function buildVeaTriageReport({ approvedOutputIssue, sampling, reviews }: { approvedOutputIssue: unknown; sampling: TriageSamplingResult; reviews: TriageReviewRecord[] }): VeaTriageReport {
	const items = normalizeTriageItems(sampling, reviews);
	return {
		schemaVersion: 1,
		triage: "vea-likely-missing-candidate-calibration",
		source: SOURCE,
		issue: 334,
		approvedOutputIssue: validateApprovedTriageOutputIssue(approvedOutputIssue),
		surface: SURFACE,
		calibrationOnly: true,
		decisionGrade: false,
		sampling: { seed: sampling.seed, requestedSize: sampling.requestedSize, selectedSize: sampling.selectedSize, strata: sampling.strata, constraints: sampling.constraints },
		items,
		aggregateCounts: buildTriageAggregateCounts(items),
		constraints: sampling.constraints,
		readOnlyPosture: ["calibration-only", "Vea-only", "read-only", "no product-missing conclusion", "no full catalog coverage", "no ingestion/write authorization"],
	};
}

export function renderVeaTriageMarkdownSummary(report: VeaTriageReport) {
	const lines = [
		"# Vea likely-missing candidate triage summary",
		"",
		"This is a calibration-only, Vea-only, read-only summary. It keeps the sample investigation-only and does not claim products are missing, complete source coverage, or permission to ingest/write data.",
		"",
		"## Scope",
		`- Source: ${report.source}`,
		`- Issue: #${report.issue}`,
		`- Approved output issue: #${report.approvedOutputIssue}`,
		`- Surface: ${report.surface}`,
		`- Decision-grade: ${report.decisionGrade}`,
		"",
		"## Sampling",
		`- Seed: ${report.sampling.seed}`,
		`- Requested size: ${report.sampling.requestedSize}`,
		`- Selected size: ${report.sampling.selectedSize}`,
		"",
		"## Aggregate counts",
		"| Classification | Count |",
		"|---|---:|",
		...TRIAGE_CLASSIFICATIONS.map((classification) => `| ${classification} | ${report.aggregateCounts[classification]} |`),
		"",
		"## Constraints",
		...(report.constraints.length ? report.constraints.map((constraint) => `- ${constraint}`) : ["- None"]),
		"",
		"## Item notes",
		"| Sample | Classification | Follow-up reason |",
		"|---:|---|---|",
		...report.items.map((item) => `| ${item.sampleIndex} | ${item.classification} | ${escapeMarkdownTableCell(item.followUpReason ?? "None")} |`),
	];
	const markdown = lines.join("\n");
	assertCalibrationOnlyWording(markdown);
	return markdown;
}

export function normalizeTriageItems(sampling: TriageSamplingResult, reviews: TriageReviewRecord[]) {
	const reviewByIdentity = new Map(reviews.map((review) => [`${review.sampleIndex}:${review.candidateIdentity}`, review]));
	return sampling.selected.map((selected): NormalizedTriageItem => {
		const review = reviewByIdentity.get(`${selected.sampleIndex}:${selected.candidateIdentity}`);
		if (!review) throw new Error(`missing review for sampled Vea triage item ${selected.sampleIndex}`);
		const validated = validateTriageClassification(review);
		return { sampleIndex: selected.sampleIndex, candidateIdentity: selected.candidateIdentity, categoryPath: selected.categoryPath, classification: validated.classification, followUpReason: validated.followUpReason, evidenceRefs: normalizeEvidenceRefs(review.evidenceRefs) };
	});
}

export function assertReadOnlyTriageFlags(argv: string[]) {
	const rejectedSourceFlag = findRejectedSourceFlag(argv);
	if (rejectedSourceFlag) throw new Error("Vea likely-missing triage is Vea-only");
	const forbidden = argv.find((entry) => FORBIDDEN_FLAGS.some((flag) => entry === flag || entry.startsWith(`${flag}=`)));
	if (forbidden) throw new Error(`read-only triage rejects ${forbidden}`);
}

export function assertCalibrationOnlyWording(value: string) {
	const normalized = value.toLowerCase();
	if (!normalized.includes("calibration-only")) throw new Error("Vea triage wording must state calibration-only");
	if (/confirmed\s+missing|confirms?\s+\d*\s*missing\s+products?/.test(normalized)) throw new Error("Vea triage wording must not claim confirmed missing products");
	if (/full[-\s]+catalog\s+coverage|complete\s+catalog\s+coverage/.test(normalized)) throw new Error("Vea triage wording must not claim full catalog coverage");
	if (/(?:grants?|authorizes?|allows?)\s+(?:ingestion|write)|(?:ingestion|write)\s+authorization\s+(?:granted|approved)/.test(normalized)) throw new Error("Vea triage wording must not grant ingestion/write authorization");
}

function allocateStrata(strata: Array<[string, Array<{ candidate: TriageCandidate; identity: string }>]>, targetSize: number, seed: string) {
	const allocations = new Map<string, number>();
	if (!targetSize) return allocations;
	if (strata.length > targetSize) {
		const selected = new Set(strata.map(([categoryPath]) => ({ categoryPath, order: sha256Hex(`${seed}:${categoryPath}`) })).sort((left, right) => left.order.localeCompare(right.order) || left.categoryPath.localeCompare(right.categoryPath)).slice(0, targetSize).map((entry) => entry.categoryPath));
		for (const [categoryPath] of strata) allocations.set(categoryPath, selected.has(categoryPath) ? 1 : 0);
		return allocations;
	}
	const eligibleCount = strata.reduce((sum, [, rows]) => sum + rows.length, 0);
	const remainders = strata.map(([categoryPath, rows]) => {
		const exact = (rows.length / eligibleCount) * targetSize;
		const base = Math.min(rows.length, Math.max(1, Math.floor(exact)));
		allocations.set(categoryPath, base);
		return { categoryPath, remainder: exact - Math.floor(exact), capacity: rows.length - base };
	});
	let allocated = Array.from(allocations.values()).reduce((sum, value) => sum + value, 0);
	while (allocated > targetSize) {
		const next = remainders.filter((entry) => (allocations.get(entry.categoryPath) ?? 0) > 1).sort((left, right) => left.remainder - right.remainder || right.categoryPath.localeCompare(left.categoryPath))[0];
		if (!next) break;
		allocations.set(next.categoryPath, (allocations.get(next.categoryPath) ?? 0) - 1); allocated -= 1;
	}
	while (allocated < targetSize) {
		const next = remainders.filter((entry) => entry.capacity > 0).sort((left, right) => right.remainder - left.remainder || left.categoryPath.localeCompare(right.categoryPath))[0];
		if (!next) break;
		allocations.set(next.categoryPath, (allocations.get(next.categoryPath) ?? 0) + 1); next.capacity -= 1; allocated += 1;
	}
	return allocations;
}

function orderRows(rows: Array<{ candidate: TriageCandidate; identity: string }>, seed: string, categoryPath: string) {
	return [...rows].sort((left, right) => sha256Hex(`${seed}:${categoryPath}:${left.identity}`).localeCompare(sha256Hex(`${seed}:${categoryPath}:${right.identity}`)) || left.identity.localeCompare(right.identity));
}

function canonicalIdentity(candidate: TriageCandidate) {
	const directSku = text(candidate.skuId); if (directSku) return `skuId:${directSku}`;
	const productUrl = normalizedUrl(candidate.productUrl); if (productUrl) return `productUrl:${productUrl}`;
	const ean = text(candidate.ean); if (ean) return `ean:${ean}`;
	const kind = text(candidate.identityKind); const identity = text(candidate.identity); if (kind && identity) return `${kind}:${identity}`;
	const name = text(candidate.name); return name ? `name:${name}` : `candidate:${sha256Hex(JSON.stringify(candidate))}`;
}

function safeOutputFileName(fileName: string) {
	if (!fileName || fileName.includes("\0") || win32.isAbsolute(fileName) || posix.isAbsolute(fileName)) throw new Error("Vea triage output file name must be relative");
	const segments = fileName.split(/[\\/]+/);
	if (segments.length !== 1 || segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("Vea triage output file name rejects traversal or unsafe path segments");
	if (!fileName.endsWith(".json") && !fileName.endsWith(".md")) throw new Error("Vea triage output must be JSON or Markdown");
	return fileName;
}

function findRejectedSourceFlag(argv: string[]) {
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (entry.startsWith("--source=") && entry !== "--source=vea") return entry;
		if (entry === "--source" && argv[index + 1] !== "vea") return entry;
	}
	return null;
}

function buildTriageAggregateCounts(items: readonly NormalizedTriageItem[]) {
	const counts = Object.fromEntries(TRIAGE_CLASSIFICATIONS.map((classification) => [classification, 0])) as Record<TriageClassification, number>;
	for (const item of items) counts[item.classification] += 1;
	return counts;
}

function normalizeEvidenceRefs(value: unknown) {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()) : [];
}

function escapeMarkdownTableCell(value: string) { return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>"); }

function text(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? String(value) : typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null; }
function normalizedUrl(value: unknown) { const raw = text(value); if (!raw) return null; try { const url = new URL(raw); return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/g, "").toLowerCase() || "/"}`; } catch { return raw.replace(/[?#].*$/, "").replace(/\/+$/g, "").toLowerCase(); } }
function sha256Hex(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
