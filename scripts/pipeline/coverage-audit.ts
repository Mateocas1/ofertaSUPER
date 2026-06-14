import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

import { getOptionalSingleFlag, parsePositiveIntegerFlag, uniqueSorted } from "./audit-utils";

export type CoverageAuditConfidenceStatus = "PASS" | "FAIL";

export type CoverageAuditInputCandidate = {
	source?: unknown;
	surface?: unknown;
	ean?: unknown;
	skuId?: unknown;
	productId?: unknown;
	url?: unknown;
	name?: unknown;
};

type CoverageAuditInputCandidateWithMetadata = CoverageAuditInputCandidate & {
	__coverageAuditMetadataErrors?: string[];
};

type CoverageAuditWrapperDefaults = {
	source: string | null;
	sourceReason: string | null;
	surface: string | null;
	surfaceReason: string | null;
};

export type CoverageAuditCliOptions = {
	input: string;
	output: string;
	requestBudget: number;
	sourceBudget: number;
	issue: number;
	windowStart: string;
	windowEnd: string;
	generatedAt: string;
};

export type CoverageAuditReport = {
	schemaVersion: 1;
	audit: "coverage-audit-by-source-surface";
	bounded: true;
	exhaustive: false;
	readOnly: true;
	generatedAt: string;
	auditWindow: { start: string | null; end: string | null };
	issue: number;
	lineage: {
		issue: number;
		inputPath: string;
		inputSha256: string;
		outputPath: string;
		writeBoundary: typeof WRITE_BOUNDARY;
	};
	budgets: {
		request: { limit: number; used: number; status: CoverageAuditConfidenceStatus };
		source: {
			limit: number;
			usedBySource: Record<string, number>;
			status: CoverageAuditConfidenceStatus;
		};
		stopCondition: {
			triggered: boolean;
			reasons: string[];
		};
	};
	counts: {
		candidateRows: number;
		denominatorCandidates: number;
		duplicateRows: number;
		overlapIdentities: number;
		ambiguousRows: number;
		errorRows: number;
	};
	bySourceSurface: Array<{
		source: string;
		surface: string;
		candidateRows: number;
		denominatorCandidates: number;
		duplicateRows: number;
		ambiguousRows: number;
		errorRows: number;
	}>;
	normalizedCandidateIdentities: Array<{
		source: string;
		surface: string;
		identity: string;
		identityKind: CoverageAuditIdentityKind;
	}>;
	duplicates: Array<{ source: string; surface: string; identity: string; rows: number }>;
	overlaps: Array<{ source: string; identity: string; surfaces: string[] }>;
	ambiguous: Array<{ row: number; source: string | null; surface: string | null; reason: string }>;
	errors: Array<{ row: number; reason: string }>;
	confidence: {
		status: CoverageAuditConfidenceStatus;
		reasons: string[];
	};
	posture: {
		readOnly: true;
		productionWrites: false;
		dbWrites: false;
		artifactWrites: "bounded-audit-output-only";
		bounded: true;
		exhaustive: false;
		writeBoundary: typeof WRITE_BOUNDARY;
		rejectedOperations: string[];
	};
};

type CoverageAuditIdentityKind = "ean" | "skuId" | "productId" | "url" | "name";

const WRITE_BOUNDARY =
	"bounded coverage audit artifact write under repo-relative audit/ only; no DB writes, no discovery apply, no scheduler/all-source execution, no deploy, no migrations, no cache purge, no production writes" as const;
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
	"--input",
	"--output",
	"--request-budget",
	"--source-budget",
	"--issue-number",
	"--window-start",
	"--window-end",
	"--generated-at",
]);

export function parseCoverageAuditCliOptions(argv = process.argv): CoverageAuditCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);
	if (foundForbidden) {
		throw new Error(`coverage audit rejects ${foundForbidden}`);
	}

	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) throw new Error(`unknown coverage audit flag ${unknownFlag}`);

	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) throw new Error(`coverage audit requires ${bareAllowedFlag}=...`);

	const input = getOptionalSingleFlag(argv, "--input")?.trim();
	if (!input) throw new Error("coverage audit requires --input=...");
	const generatedAt = getRequiredIsoTimestampFlag(argv, "--generated-at");
	const { windowStart, windowEnd } = getRequiredAuditWindow(argv);

	return {
		input,
		output: normalizeCoverageAuditOutputPath(
			getOptionalSingleFlag(argv, "--output")?.trim() ?? "audit/coverage-audit-issue-243.json",
		),
		requestBudget: parsePositiveIntegerFlag(argv, "--request-budget", 100),
		sourceBudget: parsePositiveIntegerFlag(argv, "--source-budget", 50),
		issue: parsePositiveIntegerFlag(argv, "--issue-number", 243),
		windowStart,
		windowEnd,
		generatedAt,
	};
}

export function normalizeCoverageAuditOutputPath(output: string) {
	if (!output) throw new Error("coverage audit output must be a repo-relative audit/*.json path");
	if (output.includes("\0")) throw new Error("coverage audit output path contains an invalid character");
	if (win32.isAbsolute(output) || posix.isAbsolute(output)) {
		throw new Error("coverage audit output must be repo-relative under audit/");
	}

	const segments = output.split(/[\\/]+/);
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
		throw new Error("coverage audit output rejects traversal or unsafe path segments");
	}
	if (segments[0] !== "audit" || segments.length < 2) {
		throw new Error("coverage audit output must be under repo-relative audit/");
	}
	const fileName = segments.at(-1) ?? "";
	if (!fileName.endsWith(".json")) throw new Error("coverage audit output must be a .json artifact");

	return segments.join(posix.sep);
}

function getRequiredIsoTimestampFlag(argv: string[], flag: string) {
	const value = getOptionalSingleFlag(argv, flag)?.trim();
	if (!value) throw new Error(`coverage audit requires ${flag}=<ISO>`);
	return requireValidIsoTimestamp(value, flag);
}

function getRequiredAuditWindow(argv: string[]) {
	const windowStart = getRequiredIsoTimestampFlag(argv, "--window-start");
	const windowEnd = getRequiredIsoTimestampFlag(argv, "--window-end");
	const validated = validateAuditWindow(windowStart, windowEnd);
	return { windowStart: validated.start, windowEnd: validated.end };
}

function validateAuditWindow(windowStart: string, windowEnd: string) {
	const start = requireValidIsoTimestamp(windowStart, "--window-start");
	const end = requireValidIsoTimestamp(windowEnd, "--window-end");
	if (Date.parse(start) > Date.parse(end)) {
		throw new Error("coverage audit requires --window-start <= --window-end");
	}
	return { start, end };
}

function requireValidIsoTimestamp(value: string, label: string) {
	const parsed = new Date(value);
	if (!isValidDate(parsed) || parsed.toISOString() !== value) {
		throw new Error(`coverage audit requires valid ISO timestamp for ${label}`);
	}
	return value;
}

function requireValidDate(value: Date, label: string) {
	if (!isValidDate(value)) throw new Error(`coverage audit requires valid ${label}`);
	return value;
}

function isValidDate(value: Date) {
	return value instanceof Date && Number.isFinite(value.getTime());
}

export function parseCoverageAuditCandidatesJson(raw: string): CoverageAuditInputCandidate[] {
	const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
	if (Array.isArray(parsed)) return parsed as CoverageAuditInputCandidate[];
	if (parsed && typeof parsed === "object" && Array.isArray((parsed as { candidates?: unknown }).candidates)) {
		const defaults = getCoverageAuditWrapperDefaults(parsed as Record<string, unknown>);
		return (parsed as { candidates: CoverageAuditInputCandidate[] }).candidates.map((candidate) =>
			applyCoverageAuditWrapperDefaults(candidate, defaults),
		);
	}
	throw new Error("coverage audit input must be an array or object with candidates[]");
}

export function buildCoverageAuditReport({
	candidates,
	requestBudget,
	sourceBudget,
	issue = 243,
	generatedAt,
	windowStart,
	windowEnd,
	inputPath,
	inputRaw,
	outputPath,
}: {
	candidates: CoverageAuditInputCandidate[];
	requestBudget: number;
	sourceBudget: number;
	issue?: number;
	generatedAt: Date;
	windowStart: string;
	windowEnd: string;
	inputPath: string;
	inputRaw: string;
	outputPath: string;
}): CoverageAuditReport {
	const normalizedGeneratedAt = requireValidDate(generatedAt, "generatedAt").toISOString();
	const auditWindow = validateAuditWindow(windowStart, windowEnd);
	const safeOutputPath = normalizeCoverageAuditOutputPath(outputPath);
	const errors: CoverageAuditReport["errors"] = [];
	const ambiguous: CoverageAuditReport["ambiguous"] = [];
	const rowsByIdentity = new Map<string, { source: string; surface: string; identityKind: CoverageAuditIdentityKind; identityValue: string; rows: number }>();
	const rowsBySourceSurface = new Map<string, { source: string; surface: string; candidateRows: number; identities: Set<string>; ambiguousRows: number; errorRows: number }>();
	const surfacesBySourceIdentity = new Map<string, { source: string; identityKind: CoverageAuditIdentityKind; identityValue: string; surfaces: Set<string> }>();
	const usedBySource: Record<string, number> = {};
	const normalizedCandidateIdentities: CoverageAuditReport["normalizedCandidateIdentities"] = [];

	candidates.forEach((candidate, index) => {
		const row = index + 1;
		if (!candidate || typeof candidate !== "object") {
			errors.push({ row, reason: "candidate row must be an object" });
			return;
		}

		const source = normalizeRequiredText(candidate.source);
		const surface = normalizeRequiredText(candidate.surface);
		if (!source || !surface) {
			errors.push({ row, reason: getCoverageAuditMetadataError(candidate, source, surface) });
			return;
		}

		usedBySource[source] = (usedBySource[source] ?? 0) + 1;
		const bucket = getSourceSurfaceBucket(rowsBySourceSurface, source, surface);
		bucket.candidateRows += 1;

		const identity = normalizeCandidateIdentity(candidate);
		if (!identity) {
			bucket.ambiguousRows += 1;
			ambiguous.push({
				row,
				source,
				surface,
				reason: "candidate has no stable identity; expected ean, skuId, productId, url, or name",
			});
			return;
		}

		const fullKey = JSON.stringify([source, surface, identity.kind, identity.value]);
		const existingIdentityRows = rowsByIdentity.get(fullKey);
		if (existingIdentityRows) existingIdentityRows.rows += 1;
		else rowsByIdentity.set(fullKey, { source, surface, identityKind: identity.kind, identityValue: identity.value, rows: 1 });
		bucket.identities.add(JSON.stringify([identity.kind, identity.value]));
		normalizedCandidateIdentities.push({
			source,
			surface,
			identity: identity.value,
			identityKind: identity.kind,
		});

		const overlapKey = JSON.stringify([source, identity.kind, identity.value]);
		const existingOverlap = surfacesBySourceIdentity.get(overlapKey);
		if (existingOverlap) existingOverlap.surfaces.add(surface);
		else surfacesBySourceIdentity.set(overlapKey, { source, identityKind: identity.kind, identityValue: identity.value, surfaces: new Set([surface]) });
	});

	const duplicates = Array.from(rowsByIdentity.values())
		.filter(({ rows }) => rows > 1)
		.map(({ source, surface, identityKind, identityValue, rows }) => ({ source, surface, identity: `${identityKind}:${identityValue}`, rows }))
		.sort(compareSourceSurfaceIdentity);
	const overlaps = Array.from(surfacesBySourceIdentity.values())
		.filter(({ surfaces }) => surfaces.size > 1)
		.map(({ source, identityKind, identityValue, surfaces }) => ({ source, identity: `${identityKind}:${identityValue}`, surfaces: Array.from(surfaces).sort() }))
		.sort((left, right) => `${left.source}:${left.identity}`.localeCompare(`${right.source}:${right.identity}`));

	const sourceBudgetReasons = Object.entries(usedBySource)
		.filter(([, used]) => used > sourceBudget)
		.map(([source, used]) => `source budget exceeded for ${source}: used ${used} > limit ${sourceBudget}`);
	const stopReasons = [
		...(candidates.length > requestBudget
			? [`request budget exceeded: used ${candidates.length} > limit ${requestBudget}`]
			: []),
		...sourceBudgetReasons,
	];
	const confidenceReasons = uniqueSorted([
		...stopReasons,
		...(ambiguous.length > 0 ? [`ambiguous identities require fail-closed review: ${ambiguous.length}`] : []),
		...(errors.length > 0 ? [`invalid candidate rows require fail-closed review: ${errors.length}`] : []),
	]);

	return {
		schemaVersion: 1,
		audit: "coverage-audit-by-source-surface",
		bounded: true,
		exhaustive: false,
		readOnly: true,
		generatedAt: normalizedGeneratedAt,
		auditWindow,
		issue,
		lineage: {
			issue,
			inputPath,
			inputSha256: sha256(inputRaw),
			outputPath: safeOutputPath,
			writeBoundary: WRITE_BOUNDARY,
		},
		budgets: {
			request: { limit: requestBudget, used: candidates.length, status: candidates.length <= requestBudget ? "PASS" : "FAIL" },
			source: { limit: sourceBudget, usedBySource: sortRecord(usedBySource), status: sourceBudgetReasons.length === 0 ? "PASS" : "FAIL" },
			stopCondition: { triggered: stopReasons.length > 0, reasons: uniqueSorted(stopReasons) },
		},
		counts: {
			candidateRows: candidates.length,
			denominatorCandidates: rowsByIdentity.size,
			duplicateRows: duplicates.reduce((sum, duplicate) => sum + duplicate.rows - 1, 0),
			overlapIdentities: overlaps.length,
			ambiguousRows: ambiguous.length,
			errorRows: errors.length,
		},
		bySourceSurface: Array.from(rowsBySourceSurface.values())
			.map((bucket) => ({
				source: bucket.source,
				surface: bucket.surface,
				candidateRows: bucket.candidateRows,
				denominatorCandidates: bucket.identities.size,
				duplicateRows: Array.from(rowsByIdentity.values()).filter(
					(entry) => entry.source === bucket.source && entry.surface === bucket.surface && entry.rows > 1,
				).reduce((sum, entry) => sum + entry.rows - 1, 0),
				ambiguousRows: bucket.ambiguousRows,
				errorRows: bucket.errorRows,
			}))
			.sort((left, right) => `${left.source}:${left.surface}`.localeCompare(`${right.source}:${right.surface}`)),
		normalizedCandidateIdentities: normalizedCandidateIdentities.sort((left, right) =>
			`${left.source}:${left.surface}:${left.identityKind}:${left.identity}`.localeCompare(
				`${right.source}:${right.surface}:${right.identityKind}:${right.identity}`,
			),
		),
		duplicates,
		overlaps,
		ambiguous,
		errors,
		confidence: { status: confidenceReasons.length === 0 ? "PASS" : "FAIL", reasons: confidenceReasons },
		posture: {
			readOnly: true,
			productionWrites: false,
			dbWrites: false,
			artifactWrites: "bounded-audit-output-only",
			bounded: true,
			exhaustive: false,
			writeBoundary: WRITE_BOUNDARY,
			rejectedOperations: [...FORBIDDEN_FLAGS],
		},
	};
}

function getCoverageAuditWrapperDefaults(wrapper: Record<string, unknown>): CoverageAuditWrapperDefaults {
	const sourceResult = getWrapperSourceDefault(wrapper.sources);
	const surfaceResult = getWrapperSurfaceDefault(wrapper.coverage);
	return {
		source: sourceResult.value,
		sourceReason: sourceResult.reason,
		surface: surfaceResult.value,
		surfaceReason: surfaceResult.reason,
	};
}

function applyCoverageAuditWrapperDefaults(
	candidate: CoverageAuditInputCandidate,
	defaults: CoverageAuditWrapperDefaults,
): CoverageAuditInputCandidate {
	if (!candidate || typeof candidate !== "object") return candidate;

	const normalizedSource = normalizeRequiredText(candidate.source);
	const normalizedSurface = normalizeRequiredText(candidate.surface);
	const metadataErrors: string[] = [];
	const withDefaults: CoverageAuditInputCandidateWithMetadata = { ...candidate };

	if (!normalizedSource) {
		if (defaults.source) withDefaults.source = defaults.source;
		else if (defaults.sourceReason) metadataErrors.push(defaults.sourceReason);
	}
	if (!normalizedSurface) {
		if (defaults.surface) withDefaults.surface = defaults.surface;
		else if (defaults.surfaceReason) metadataErrors.push(defaults.surfaceReason);
	}

	if (metadataErrors.length > 0) {
		Object.defineProperty(withDefaults, "__coverageAuditMetadataErrors", {
			value: metadataErrors,
			enumerable: false,
		});
	}

	return withDefaults;
}

function getWrapperSourceDefault(value: unknown): { value: string | null; reason: string | null } {
	if (!Array.isArray(value)) {
		return { value: null, reason: "wrapper source metadata is missing or ambiguous; expected exactly one sources[] value" };
	}
	const sources = uniqueSorted(value.map(normalizeRequiredText).filter((source): source is string => Boolean(source)));
	if (sources.length !== 1 || sources.length !== value.length) {
		return { value: null, reason: "wrapper source metadata is missing or ambiguous; expected exactly one sources[] value" };
	}
	return { value: sources[0], reason: null };
}

function getWrapperSurfaceDefault(value: unknown): { value: string | null; reason: string | null } {
	if (!value || typeof value !== "object") {
		return { value: null, reason: "wrapper coverage metadata is missing or ambiguous; expected coverage.mode and coverage.surface" };
	}
	const coverage = value as Record<string, unknown>;
	const mode = normalizeRequiredText(coverage.mode);
	const surface = normalizeRequiredText(coverage.surface);
	const modeConflict = hasConflictingSingularAndList(mode, coverage.modes);
	const surfaceConflict = hasConflictingSingularAndList(surface, coverage.surfaces);
	if (modeConflict || surfaceConflict) {
		return { value: null, reason: "wrapper coverage metadata is conflicting; coverage singular values disagree with list values" };
	}
	if (!mode || !surface) {
		return { value: null, reason: "wrapper coverage metadata is missing or ambiguous; expected coverage.mode and coverage.surface" };
	}
	return { value: surface, reason: null };
}

function hasConflictingSingularAndList(singular: string | null, list: unknown) {
	if (!Array.isArray(list)) return false;
	const values = uniqueSorted(list.map(normalizeRequiredText).filter((entry): entry is string => Boolean(entry)));
	if (values.length !== 1 || values.length !== list.length) return true;
	return Boolean(singular && values[0] !== singular);
}

function getCoverageAuditMetadataError(
	candidate: CoverageAuditInputCandidate,
	source: string | null,
	surface: string | null,
) {
	const metadataErrors = (candidate as CoverageAuditInputCandidateWithMetadata).__coverageAuditMetadataErrors ?? [];
	if (metadataErrors.length > 0) return metadataErrors.join("; ");
	if (!source && !surface) return "candidate row requires source and surface";
	if (!source) return "candidate row requires source";
	return "candidate row requires surface";
}

function getSourceSurfaceBucket(
	rowsBySourceSurface: Map<string, { source: string; surface: string; candidateRows: number; identities: Set<string>; ambiguousRows: number; errorRows: number }>,
	source: string,
	surface: string,
) {
	const key = JSON.stringify([source, surface]);
	const existing = rowsBySourceSurface.get(key);
	if (existing) return existing;
	const created = { source, surface, candidateRows: 0, identities: new Set<string>(), ambiguousRows: 0, errorRows: 0 };
	rowsBySourceSurface.set(key, created);
	return created;
}

function normalizeCandidateIdentity(candidate: CoverageAuditInputCandidate): { kind: CoverageAuditIdentityKind; value: string } | null {
	for (const kind of ["ean", "skuId", "productId", "url", "name"] as const) {
		const value = normalizeRequiredText(candidate[kind]);
		if (value) return { kind, value };
	}
	return null;
}

function normalizeRequiredText(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function compareSourceSurfaceIdentity(
	left: { source: string; surface: string; identity: string },
	right: { source: string; surface: string; identity: string },
) {
	return `${left.source}:${left.surface}:${left.identity}`.localeCompare(`${right.source}:${right.surface}:${right.identity}`);
}

function sortRecord(record: Record<string, number>) {
	return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function sha256(value: string) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
