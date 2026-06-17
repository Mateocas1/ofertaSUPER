import { posix, win32 } from "node:path";

import { getOptionalSingleFlag, getRequiredSingleFlag, parsePositiveIntegerFlag, uniqueSorted } from "./audit-utils";
import { resolveCategoryPaginationSource, type CategoryPaginationSource } from "./category-pagination-audit";

export type CategoryPaginationCatalogComparisonOptions = {
	source: CategoryPaginationSource;
	issue: number;
	candidateArtifact: string;
	catalogFixture: string;
	output: string;
	generatedAt: string | null;
};

export type CatalogIdentityRow = {
	source?: string | null;
	skuId?: string | number | null;
	productUrl?: string | null;
	ean?: string | number | null;
	name?: string | null;
};

type CandidateIdentityRow = CatalogIdentityRow & {
	surface?: string | null;
	identityKind?: string | null;
	identity?: string | number | null;
	categoryPath?: string | null;
};

type MatchKeyType = "skuId" | "productUrl" | "ean";
type ConfidenceStatus = "PASS" | "WARN" | "FAIL";

export type CategoryPaginationCatalogComparisonReport = {
	schemaVersion: 1;
	comparison: "category-pagination-catalog-identity";
	source: CategoryPaginationSource;
	issue: number;
	surface: "category-pagination";
	generatedAt: string;
	inputs: {
		candidateArtifact: string;
		catalogIdentityFixture: string;
	};
	posture: {
		readOnly: true;
		dbWrites: false;
		productionWrites: false;
		artifactOnly: true;
		artifactWrites: string;
		writeBoundary: string;
		rejectedOperations: string[];
	};
	counts: {
		totalCandidates: number;
		knownCandidates: number;
		likelyMissingCandidates: number;
		duplicateCandidates: number;
		conflictCandidates: number;
		insufficientIdentityRows: number;
	};
	matchBreakdown: Record<MatchKeyType, { known: number; conflict: number }>;
	samples: {
		known: ComparisonSample[];
		likelyMissing: ComparisonSample[];
		duplicates: ComparisonSample[];
		conflicts: ComparisonSample[];
		insufficientIdentity: ComparisonSample[];
	};
	confidence: { status: ConfidenceStatus; reasons: string[] };
};

type ComparisonSample = {
	source: CategoryPaginationSource;
	identity: Partial<Record<MatchKeyType, string>>;
	categoryPath?: string;
	matchedBy?: MatchKeyType;
	reason?: string;
};

const DEFAULT_ISSUE = 320;
const SURFACE = "category-pagination" as const;
const SAMPLE_LIMIT = 25;
const FORBIDDEN_FLAGS = [
	"--apply",
	"--write",
	"--confirm",
	"--execute",
	"--delete",
	"--scheduler",
	"--all-source",
	"--all-sources",
	"--deploy",
	"--migrations",
	"--purge-cache",
	"--production",
];
const ALLOWED_FLAGS = new Set([
	"--source",
	"--issue-number",
	"--candidate-artifact",
	"--catalog-fixture",
	"--output",
	"--generated-at",
]);

export function parseCategoryPaginationCatalogComparisonCliOptions(argv = process.argv): CategoryPaginationCatalogComparisonOptions {
	const foundForbidden = argv.find((entry) => FORBIDDEN_FLAGS.some((flag) => entry === flag || entry.startsWith(`${flag}=`)));
	if (foundForbidden) throw new Error(`category pagination catalog comparison rejects ${foundForbidden}`);

	const unknownFlag = argv.slice(2).find((entry) => entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]));
	if (unknownFlag) throw new Error(`unknown category pagination catalog comparison flag ${unknownFlag}`);

	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) throw new Error(`category pagination catalog comparison requires ${bareAllowedFlag}=...`);

	const source = resolveCategoryPaginationSource(getOptionalSingleFlag(argv, "--source") ?? "vea");
	const issue = parsePositiveIntegerFlag(argv, "--issue-number", DEFAULT_ISSUE);
	const boundary = categoryPaginationCatalogComparisonOutputBoundary({ issue, source });
	const generatedAt = getOptionalSingleFlag(argv, "--generated-at")?.trim() ?? null;
	if (generatedAt) requireValidIsoTimestamp(generatedAt, "--generated-at");

	return {
		source,
		issue,
		candidateArtifact: normalizeCategoryPaginationCandidateArtifactPath(getRequiredSingleFlag(argv, "--candidate-artifact"), boundary),
		catalogFixture: normalizeRepoRelativeJsonPath(getRequiredSingleFlag(argv, "--catalog-fixture"), "catalog identity fixture"),
		output: normalizeCategoryPaginationCatalogComparisonOutputPath(getOptionalSingleFlag(argv, "--output")?.trim() ?? defaultCategoryPaginationCatalogComparisonOutputPath(boundary), boundary),
		generatedAt,
	};
}

export function buildCategoryPaginationCatalogComparisonReport({
	candidateArtifact,
	catalogFixture,
	generatedAt,
	issue,
	outputPath,
	source,
}: {
	candidateArtifact: unknown;
	catalogFixture: unknown;
	generatedAt: Date;
	issue: number;
	outputPath: string;
	source: CategoryPaginationSource;
}): CategoryPaginationCatalogComparisonReport {
	const boundary = categoryPaginationCatalogComparisonOutputBoundary({ issue, source });
	const safeOutputPath = normalizeCategoryPaginationCatalogComparisonOutputPath(outputPath, boundary);
	const candidateRows = extractCandidateRows(candidateArtifact, source);
	const catalogRows = extractCatalogRows(catalogFixture, source);
	const catalogIndex = buildCatalogIndex(catalogRows, source);
	const duplicateKeys = duplicateCandidateKeys(candidateRows);
	const duplicateCandidateIndexes = new Set<number>();
	const seenCandidateKeys = new Set<string>();

	const matchBreakdown = {
		skuId: { known: 0, conflict: 0 },
		productUrl: { known: 0, conflict: 0 },
		ean: { known: 0, conflict: 0 },
	};
	const samples: CategoryPaginationCatalogComparisonReport["samples"] = {
		known: [],
		likelyMissing: [],
		duplicates: [],
		conflicts: [],
		insufficientIdentity: [],
	};

	let knownCandidates = 0;
	let likelyMissingCandidates = 0;
	let conflictCandidates = 0;
	let insufficientIdentityRows = catalogIndex.insufficientRows;

	candidateRows.forEach((candidate, index) => {
		const identity = normalizeCandidateIdentity(candidate);
		const duplicateKey = candidateDuplicateKey(identity);
		if (duplicateKey) {
			if (seenCandidateKeys.has(duplicateKey)) duplicateCandidateIndexes.add(index);
			seenCandidateKeys.add(duplicateKey);
		}

		if (!hasUsableIdentity(identity)) {
			insufficientIdentityRows += 1;
			pushSample(samples.insufficientIdentity, sampleFor(candidate, source, identity, "no usable skuId, productUrl, or ean"));
			return;
		}

		const match = matchCandidate(identity, catalogIndex);
		if (match.status === "conflict") {
			conflictCandidates += 1;
			for (const keyType of match.keyTypes) matchBreakdown[keyType].conflict += 1;
			pushSample(samples.conflicts, sampleFor(candidate, source, identity, match.reason));
			return;
		}

		if (match.status === "known") {
			knownCandidates += 1;
			matchBreakdown[match.keyType].known += 1;
			pushSample(samples.known, { ...sampleFor(candidate, source, identity), matchedBy: match.keyType });
			return;
		}

		likelyMissingCandidates += 1;
		pushSample(samples.likelyMissing, sampleFor(candidate, source, identity, "no source-scoped catalog identity match"));
	});

	for (const [index, candidate] of candidateRows.entries()) {
		if (duplicateCandidateIndexes.has(index)) pushSample(samples.duplicates, sampleFor(candidate, source, normalizeCandidateIdentity(candidate), "duplicate candidate identity inside artifact"));
	}

	const duplicateCandidates = Math.max(duplicateKeys.length, duplicateCandidateIndexes.size);
	const reasons = uniqueSorted([
		...(conflictCandidates > 0 ? [`conflicting catalog identity matches require review: ${conflictCandidates}`] : []),
		...(insufficientIdentityRows > 0 ? [`rows without usable skuId, productUrl, or ean: ${insufficientIdentityRows}`] : []),
		...(duplicateCandidates > 0 ? [`duplicate candidate identities inside artifact: ${duplicateCandidates}`] : []),
		...(candidateRows.length === 0 ? ["candidate artifact has no category-pagination candidates"] : []),
	]);

	return {
		schemaVersion: 1,
		comparison: "category-pagination-catalog-identity",
		source,
		issue,
		surface: SURFACE,
		generatedAt: requireValidDate(generatedAt, "generatedAt").toISOString(),
		inputs: {
			candidateArtifact: normalizeRepoRelativeJsonPath(inputPath(candidateArtifact), "category pagination candidate artifact"),
			catalogIdentityFixture: normalizeRepoRelativeJsonPath(inputPath(catalogFixture), "catalog identity fixture"),
		},
		posture: {
			readOnly: true,
			dbWrites: false,
			productionWrites: false,
			artifactOnly: true,
			artifactWrites: `issue-${issue}-${source}-category-pagination-catalog-comparison-only`,
			writeBoundary: `artifact-only comparison under ${categoryPaginationCatalogComparisonOutputPrefix(boundary)}; no DB reads or writes, no production writes, no scheduler/all-source execution`,
			rejectedOperations: [...FORBIDDEN_FLAGS],
		},
		counts: {
			totalCandidates: candidateRows.length,
			knownCandidates,
			likelyMissingCandidates,
			duplicateCandidates,
			conflictCandidates,
			insufficientIdentityRows,
		},
		matchBreakdown,
		samples,
		confidence: { status: confidenceStatus({ candidateRows: candidateRows.length, conflictCandidates, reasons }), reasons },
	};
}

export function categoryPaginationCatalogComparisonOutputBoundary(boundary: { issue: number; source: CategoryPaginationSource }) {
	if (!Number.isInteger(boundary.issue) || boundary.issue <= 0) throw new Error("category pagination catalog comparison output requires a positive issue number");
	return { issue: boundary.issue, source: resolveCategoryPaginationSource(boundary.source), surface: SURFACE };
}

export function categoryPaginationCatalogComparisonOutputPrefix(boundary: { issue: number; source: CategoryPaginationSource }) {
	const safeBoundary = categoryPaginationCatalogComparisonOutputBoundary(boundary);
	return `audit/catalog-comparison/issue-${safeBoundary.issue}/${safeBoundary.source}/${safeBoundary.surface}/`;
}

export function defaultCategoryPaginationCatalogComparisonOutputPath(boundary: { issue: number; source: CategoryPaginationSource }) {
	return `${categoryPaginationCatalogComparisonOutputPrefix(boundary)}category-pagination-catalog-comparison.json`;
}

export function normalizeCategoryPaginationCatalogComparisonOutputPath(output: string, boundary: { issue: number; source: CategoryPaginationSource }) {
	const allowedOutputPrefix = categoryPaginationCatalogComparisonOutputPrefix(boundary);
	const normalized = normalizeRepoRelativeJsonPath(output, "category pagination catalog comparison output");
	if (!normalized.startsWith(allowedOutputPrefix)) throw new Error(`category pagination catalog comparison output must be under ${allowedOutputPrefix}`);
	return normalized;
}

export function normalizeCategoryPaginationCandidateArtifactPath(path: string, boundary: { issue: number; source: CategoryPaginationSource }) {
	const allowedInputShape = `audit/coverage/issue-<positive-issue>/${boundary.source}/${SURFACE}/*.json`;
	const normalized = normalizeRepoRelativeJsonPath(path, "category pagination candidate artifact");
	const match = normalized.match(/^audit\/coverage\/issue-([1-9]\d*)\/([^/]+)\/category-pagination\/[^/]+\.json$/);
	if (!match) throw new Error(`category pagination candidate artifact must be under ${allowedInputShape}`);
	if (match[2] !== boundary.source) throw new Error(`category pagination candidate artifact source must match --source (${boundary.source})`);
	return normalized;
}

function extractCandidateRows(value: unknown, source: CategoryPaginationSource): CandidateIdentityRow[] {
	const root = value as { candidates?: unknown; source?: unknown; lineage?: unknown };
	const rows = Array.isArray(root?.candidates) ? root.candidates : Array.isArray(value) ? value : [];
	return rows
		.filter((row): row is CandidateIdentityRow => Boolean(row) && typeof row === "object")
		.filter((row) => (normalizeSource(row.source) ?? normalizeArtifactSource(root.source)) === source)
		.filter((row) => !row.surface || row.surface === SURFACE);
}

function extractCatalogRows(value: unknown, source: CategoryPaginationSource): CatalogIdentityRow[] {
	const record = value as { rows?: unknown; identities?: unknown; products?: unknown };
	const rows = Array.isArray(value) ? value : Array.isArray(record?.rows) ? record.rows : Array.isArray(record?.identities) ? record.identities : Array.isArray(record?.products) ? record.products : [];
	return rows
		.filter((row): row is CatalogIdentityRow => Boolean(row) && typeof row === "object")
		.filter((row) => normalizeSource(row.source) === source);
}

function buildCatalogIndex(rows: CatalogIdentityRow[], source: CategoryPaginationSource) {
	const index = {
		skuId: new Map<string, Set<number>>(),
		productUrl: new Map<string, Set<number>>(),
		ean: new Map<string, Set<number>>(),
		insufficientRows: 0,
	};
	rows.forEach((row, rowIndex) => {
		const identity = normalizeCatalogIdentity(row);
		if (!hasUsableIdentity(identity)) {
			index.insufficientRows += 1;
			return;
		}
		for (const keyType of ["skuId", "productUrl", "ean"] as const) {
			const value = identity[keyType];
			if (!value) continue;
			const key = scopedKey(source, keyType, value);
			const matches = index[keyType].get(key) ?? new Set<number>();
			matches.add(rowIndex);
			index[keyType].set(key, matches);
		}
	});
	return index;
}

function matchCandidate(identity: Partial<Record<MatchKeyType, string>>, catalogIndex: ReturnType<typeof buildCatalogIndex>):
	| { status: "known"; keyType: MatchKeyType }
	| { status: "missing" }
	| { status: "conflict"; keyTypes: MatchKeyType[]; reason: string } {
	const matchingKeys: Array<{ keyType: MatchKeyType; rows: Set<number> }> = [];
	for (const keyType of ["skuId", "productUrl", "ean"] as const) {
		const value = identity[keyType];
		if (!value) continue;
		const rows = catalogIndex[keyType].get(scopedKeyFromIdentity(keyType, value, catalogIndex));
		if (rows?.size) matchingKeys.push({ keyType, rows });
	}
	if (matchingKeys.length === 0) return { status: "missing" };
	const rowIds = new Set(matchingKeys.flatMap((entry) => Array.from(entry.rows)));
	if (rowIds.size > 1) return { status: "conflict", keyTypes: matchingKeys.map((entry) => entry.keyType), reason: "candidate identity maps to multiple catalog rows" };
	return { status: "known", keyType: matchingKeys[0].keyType };
}

function scopedKeyFromIdentity(keyType: MatchKeyType, value: string, catalogIndex: ReturnType<typeof buildCatalogIndex>) {
	for (const key of catalogIndex[keyType].keys()) if (key.endsWith(`:${value}`)) return key;
	return `missing:${keyType}:${value}`;
}

function normalizeCandidateIdentity(row: CandidateIdentityRow): Partial<Record<MatchKeyType, string>> {
	const direct = normalizeCatalogIdentity(row);
	const identityKind = normalizedText(row.identityKind);
	const identityValue = normalizedText(row.identity);
	if (identityKind === "skuid" && identityValue) direct.skuId = identityValue;
	if (identityKind === "url" && identityValue) direct.productUrl = normalizeProductUrl(identityValue);
	if (identityKind === "ean" && identityValue) direct.ean = identityValue;
	return direct;
}

function normalizeCatalogIdentity(row: CatalogIdentityRow): Partial<Record<MatchKeyType, string>> {
	return {
		skuId: normalizedText(row.skuId) ?? undefined,
		productUrl: normalizeProductUrl(row.productUrl) ?? undefined,
		ean: normalizedText(row.ean) ?? undefined,
	};
}

function duplicateCandidateKeys(rows: CandidateIdentityRow[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();
	for (const row of rows) {
		const key = candidateDuplicateKey(normalizeCandidateIdentity(row));
		if (!key) continue;
		if (seen.has(key)) duplicates.add(key);
		seen.add(key);
	}
	return Array.from(duplicates).sort();
}

function candidateDuplicateKey(identity: Partial<Record<MatchKeyType, string>>) {
	for (const keyType of ["skuId", "productUrl", "ean"] as const) {
		const value = identity[keyType];
		if (value) return `${keyType}:${value}`;
	}
	return null;
}

function sampleFor(row: CandidateIdentityRow, source: CategoryPaginationSource, identity: Partial<Record<MatchKeyType, string>>, reason?: string): ComparisonSample {
	return {
		source: resolveCategoryPaginationSource(normalizeSource(row.source) ?? source),
		identity,
		...(normalizedText(row.categoryPath) ? { categoryPath: normalizedText(row.categoryPath)! } : {}),
		...(reason ? { reason } : {}),
	};
}

function pushSample(samples: ComparisonSample[], sample: ComparisonSample) {
	if (samples.length < SAMPLE_LIMIT) samples.push(sample);
}

function hasUsableIdentity(identity: Partial<Record<MatchKeyType, string>>) {
	return Boolean(identity.skuId || identity.productUrl || identity.ean);
}

function scopedKey(source: CategoryPaginationSource, keyType: MatchKeyType, value: string) {
	return `${source}:${keyType}:${value}`;
}

function normalizeRepoRelativeJsonPath(path: string, label: string) {
	if (!path) throw new Error(`${label} must be a repo-relative .json path`);
	if (path.includes("\0")) throw new Error(`${label} contains an invalid character`);
	if (win32.isAbsolute(path) || posix.isAbsolute(path)) throw new Error(`${label} must be repo-relative`);
	const segments = path.split(/[\\/]+/);
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error(`${label} rejects traversal or unsafe path segments`);
	const normalized = segments.join(posix.sep);
	if (!normalized.endsWith(".json")) throw new Error(`${label} must be a .json artifact`);
	return normalized;
}

function normalizeProductUrl(value: unknown) {
	const text = normalizedText(value);
	if (!text) return null;
	try {
		const url = new URL(text);
		return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/g, "").toLowerCase() || "/"}`;
	} catch {
		return text.replace(/[?#].*$/, "").replace(/\/+$/g, "").toLowerCase();
	}
}

function normalizeSource(value: unknown) {
	if (typeof value === "string" && value.trim()) return value.trim().toLowerCase();
	return null;
}

function normalizeArtifactSource(value: unknown) {
	if (typeof value === "string") return normalizeSource(value);
	if (value && typeof value === "object" && "slug" in value) return normalizeSource((value as { slug?: unknown }).slug);
	return null;
}

function normalizedText(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function inputPath(value: unknown) {
	if (value && typeof value === "object" && "__inputPath" in value) {
		const path = (value as { __inputPath?: unknown }).__inputPath;
		if (typeof path === "string") return path;
	}
	return "audit/catalog-comparison/input-not-provided.json";
}

function confidenceStatus({ candidateRows, conflictCandidates, reasons }: { candidateRows: number; conflictCandidates: number; reasons: string[] }): ConfidenceStatus {
	if (candidateRows === 0 || conflictCandidates > 0) return "FAIL";
	return reasons.length > 0 ? "WARN" : "PASS";
}

function requireValidIsoTimestamp(value: string, label: string) {
	const parsed = new Date(value);
	if (!isValidDate(parsed) || parsed.toISOString() !== value) throw new Error(`category pagination catalog comparison requires valid ISO timestamp for ${label}`);
	return value;
}

function requireValidDate(value: Date, label: string) {
	if (!isValidDate(value)) throw new Error(`category pagination catalog comparison requires valid ${label}`);
	return value;
}

function isValidDate(value: Date) {
	return value instanceof Date && Number.isFinite(value.getTime());
}
