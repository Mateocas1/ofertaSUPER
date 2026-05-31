import {
	classifyPriceFreshness,
	type PriceFreshnessStatus,
} from "../../src/lib/price-freshness";

import { uniqueSorted } from "./audit-utils";

type FreshnessBaselineSource = {
	id: number;
	slug: string;
	name: string;
	freshnessSlaHours: number;
};

type FreshnessBaselineRow = {
	productEan: string | null;
	productName: string | null;
	sourceSlug: string;
	price: number | null;
	isAvailable: boolean;
	lastCheckedAt: Date | string | null;
};

type FreshnessBaselineStagingState = {
	runningRuns: number;
	pendingStagingRows: number;
};

export type FreshnessBaselineRepository = {
	listSources(slugs?: string[]): Promise<FreshnessBaselineSource[]>;
	listRows(sourceSlugs: string[]): Promise<FreshnessBaselineRow[]>;
	getStagingState(): Promise<FreshnessBaselineStagingState>;
};

export type DenominatorDeltaSnapshot = {
	globalPublicRankableRows: number;
	sources: Array<{
		slug: string;
		publicRankableRows: number;
	}>;
};

export type DenominatorDeltaExplanation =
	| { scope: "global"; reason: string }
	| { scope: "source"; slug: string; reason: string };

export type DenominatorDeltaOptions = {
	previous?: DenominatorDeltaSnapshot;
	requireComparison?: boolean;
	explanations?: DenominatorDeltaExplanation[];
	maxShrinkPercent?: number;
	maxShrinkRows?: number;
};

export type FreshnessBaselineOptions = {
	repository: FreshnessBaselineRepository;
	sourceSlugs?: string[];
	sampleSize?: number;
	now?: Date;
	targetPercent?: number;
	failUnderPercent?: number | null;
	denominatorDelta?: DenominatorDeltaOptions;
};

type FreshnessBaselineStatus = "PASS" | "WARN" | "FAIL";

type ExclusionBuckets = {
	unavailable: number;
	missingPrice: number;
	invalidPrice: number;
	missingProductName: number;
	missingProductEan: number;
	unknownNonRankable: number;
};

export type DenominatorDeltaReport = {
	status: FreshnessBaselineStatus | "NOT_COMPARED";
	requireComparison: boolean;
	thresholds: {
		maxShrinkPercent: number;
		maxShrinkRows: number;
	};
	current: DenominatorDeltaSnapshot;
	previous: DenominatorDeltaSnapshot | null;
	blockers: string[];
};

type SourceSummary = {
	slug: string;
	name: string;
	slaHours: number;
	totalRows: number;
	freshRows: number;
	staleRows: number;
	unknownRows: number;
	unavailableRows: number;
	freshnessPercent: number;
	publicRankableRows: number;
	excludedRows: number;
	exclusionBuckets: ExclusionBuckets;
	oldestCheckAt: string | null;
	latestCheckAt: string | null;
	ageBuckets: {
		withinSla: number;
		oneToSevenDays: number;
		sevenToThirtyDays: number;
		overThirtyDays: number;
		unknown: number;
	};
	samples: {
		oldest: Array<{
			ean: string;
			name: string;
			lastCheckedAt: string | null;
			status: PriceFreshnessStatus;
		}>;
	};
};

export type FreshnessBaselineReport = {
	schemaVersion: 1;
	audit: "freshness-baseline";
	generatedAt: string;
	filters: {
		sources: string[];
		sampleSize: number;
		basis: "production";
		targetPercent: number;
		failUnderPercent: number | null;
	};
	status: FreshnessBaselineStatus;
	summary: {
		sourceCount: number;
		totalRows: number;
		freshRows: number;
		staleRows: number;
		unknownRows: number;
		unavailableRows: number;
		overallFreshnessPercent: number;
	};
	denominatorDeltas: DenominatorDeltaReport;
	denominators: {
		primary: {
			publicRankableRows: number;
			excludedRows: number;
			exclusionBucketSemantics: "reasonCounts";
			exclusionBuckets: {
				global: ExclusionBuckets;
				bySource: Array<
					{
						slug: string;
						totalRows: number;
						publicRankableRows: number;
						excludedRows: number;
					} & ExclusionBuckets
				>;
			};
		};
		secondary: {
			allExistingRows: number;
		};
	};
	sources: SourceSummary[];
	eanOverlap: Array<{
		ean: string;
		name: string;
		sources: string[];
		sourceCount: number;
	}>;
	stalePublicRankingExamples: Array<{
		ean: string;
		name: string;
		source: string;
		price: number | null;
		lastCheckedAt: string | null;
	}>;
	stagingState: FreshnessBaselineStagingState;
};

function percent(part: number, total: number) {
	return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function emptyBuckets(): SourceSummary["ageBuckets"] {
	return {
		withinSla: 0,
		oneToSevenDays: 0,
		sevenToThirtyDays: 0,
		overThirtyDays: 0,
		unknown: 0,
	};
}

function ageBucket(
	status: PriceFreshnessStatus,
	checkedAt: Date | string | null,
	now: Date,
) {
	if (status === "fresh") {
		return "withinSla" as const;
	}

	if (!checkedAt) {
		return "unknown" as const;
	}

	const checkedDate =
		checkedAt instanceof Date ? checkedAt : new Date(checkedAt);

	if (Number.isNaN(checkedDate.getTime())) {
		return "unknown" as const;
	}

	const ageDays = Math.max(
		0,
		(now.getTime() - checkedDate.getTime()) / (24 * 60 * 60 * 1000),
	);

	if (ageDays <= 7) {
		return "oneToSevenDays" as const;
	}

	if (ageDays <= 30) {
		return "sevenToThirtyDays" as const;
	}

	return "overThirtyDays" as const;
}

function createEmptyExclusionBuckets(): ExclusionBuckets {
	return {
		unavailable: 0,
		missingPrice: 0,
		invalidPrice: 0,
		missingProductName: 0,
		missingProductEan: 0,
		unknownNonRankable: 0,
	};
}

function hasText(value: string | null | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function assessRankability(row: FreshnessBaselineRow) {
	const reasons: Array<keyof ExclusionBuckets> = [];

	if (!row.isAvailable) {
		reasons.push("unavailable");
	}

	if (row.price === null) {
		reasons.push("missingPrice");
	} else if (!Number.isFinite(row.price) || row.price <= 0) {
		reasons.push("invalidPrice");
	}

	if (!hasText(row.productName)) {
		reasons.push("missingProductName");
	}

	if (!hasText(row.productEan)) {
		reasons.push("missingProductEan");
	}

	if (reasons.length === 0) {
		return { isPublicRankable: true, reasons };
	}

	return { isPublicRankable: false, reasons };
}

function hasExplanation(
	explanations: DenominatorDeltaExplanation[],
	scope: "global" | "source",
	slug: string | null,
) {
	return explanations.some((explanation) => {
		if (scope === "global") {
			return explanation.scope === "global";
		}

		return explanation.scope === "source" && explanation.slug === slug;
	});
}

function buildDeltaBlocker(options: {
	scope: "global" | "source";
	slug: string | null;
	previous: number;
	current: number;
	maxShrinkPercent: number;
	maxShrinkRows: number;
	explained: boolean;
}) {
	const shrinkRows = Math.max(0, options.previous - options.current);
	const rawShrinkPercent =
		options.previous > 0 ? (shrinkRows / options.previous) * 100 : 0;
	const exceedsThreshold =
		shrinkRows > 0 &&
		(shrinkRows > options.maxShrinkRows ||
			rawShrinkPercent > options.maxShrinkPercent);

	if (!exceedsThreshold || options.explained) {
		return null;
	}

	const label = options.scope === "global" ? "global" : options.slug;
	const shrinkPercent = Number(rawShrinkPercent.toFixed(2));
	return `${label} public-rankable denominator shrank by ${shrinkRows} rows (${shrinkPercent}%) without an approved explanation`;
}

export function evaluateFreshnessDenominatorDeltas({
	current,
	previous = undefined,
	requireComparison = false,
	explanations = [],
	maxShrinkPercent = 1,
	maxShrinkRows = 10,
}: DenominatorDeltaOptions & {
	current: DenominatorDeltaSnapshot;
}): DenominatorDeltaReport {
	if (!previous) {
		return {
			status: requireComparison ? "FAIL" : "NOT_COMPARED",
			requireComparison,
			thresholds: { maxShrinkPercent, maxShrinkRows },
			current,
			previous: null,
			blockers: requireComparison
				? ["previous denominator input is required for denominator comparison"]
				: [],
		};
	}

	const currentBySource = new Map(
		current.sources.map((source) => [source.slug, source.publicRankableRows]),
	);
	const previousBySource = new Map(
		previous.sources.map((source) => [source.slug, source.publicRankableRows]),
	);
	const sourceSlugs = Array.from(
		new Set([...currentBySource.keys(), ...previousBySource.keys()]),
	).sort();
	const blockers = [
		buildDeltaBlocker({
			scope: "global",
			slug: null,
			previous: previous.globalPublicRankableRows,
			current: current.globalPublicRankableRows,
			maxShrinkPercent,
			maxShrinkRows,
			explained: hasExplanation(explanations, "global", null),
		}),
		...sourceSlugs.map((slug) =>
			buildDeltaBlocker({
				scope: "source",
				slug,
				previous: previousBySource.get(slug) ?? 0,
				current: currentBySource.get(slug) ?? 0,
				maxShrinkPercent,
				maxShrinkRows,
				explained: hasExplanation(explanations, "source", slug),
			}),
		),
	].filter((blocker): blocker is string => Boolean(blocker));

	return {
		status: blockers.length > 0 ? "FAIL" : "PASS",
		requireComparison,
		thresholds: { maxShrinkPercent, maxShrinkRows },
		current,
		previous,
		blockers,
	};
}

function summarizeSource(
	source: FreshnessBaselineSource,
	rows: FreshnessBaselineRow[],
	sampleSize: number,
	now: Date,
): SourceSummary {
	const buckets = emptyBuckets();
	const exclusionBuckets = createEmptyExclusionBuckets();
	let freshRows = 0;
	let staleRows = 0;
	let unknownRows = 0;
	let unavailableRows = 0;
	let publicRankableRows = 0;
	let excludedRows = 0;

	const classified = rows.map((row) => {
		if (!row.isAvailable) {
			unavailableRows += 1;
		}

		const freshness = classifyPriceFreshness(row.lastCheckedAt, {
			now,
			maxAgeHours: source.freshnessSlaHours,
		});
		const rankability = assessRankability(row);

		if (rankability.isPublicRankable) {
			publicRankableRows += 1;
		} else {
			excludedRows += 1;

			for (const reason of rankability.reasons) {
				exclusionBuckets[reason] += 1;
			}
		}

		if (freshness.status === "fresh") {
			freshRows += 1;
		} else if (freshness.status === "stale") {
			staleRows += 1;
		} else {
			unknownRows += 1;
		}

		buckets[ageBucket(freshness.status, row.lastCheckedAt, now)] += 1;

		return {
			row,
			status: freshness.status,
			checkedAt: freshness.checkedAt,
			rankability,
		};
	});

	const checkDates = classified
		.map((entry) => entry.checkedAt)
		.filter((entry): entry is string => Boolean(entry))
		.sort();
	const oldest = checkDates[0] ?? null;
	const latest = checkDates.at(-1) ?? null;

	return {
		slug: source.slug,
		name: source.name,
		slaHours: source.freshnessSlaHours,
		totalRows: rows.length,
		freshRows,
		staleRows,
		unknownRows,
		unavailableRows,
		freshnessPercent: percent(freshRows, rows.length),
		publicRankableRows,
		excludedRows,
		exclusionBuckets,
		oldestCheckAt: oldest,
		latestCheckAt: latest,
		ageBuckets: buckets,
		samples: {
			oldest: classified
				.toSorted((left, right) =>
					(left.checkedAt ?? "9999").localeCompare(right.checkedAt ?? "9999"),
				)
				.slice(0, sampleSize)
				.map((entry) => ({
					ean: entry.row.productEan ?? "",
					name: entry.row.productName ?? "",
					lastCheckedAt: entry.checkedAt,
					status: entry.status,
				})),
		},
	};
}

function buildEanOverlap(rows: FreshnessBaselineRow[], sampleSize: number) {
	const byEan = new Map<string, { name: string; sources: Set<string> }>();

	for (const row of rows) {
		if (!hasText(row.productEan)) {
			continue;
		}

		const ean = row.productEan.trim();
		const current = byEan.get(ean) ?? {
			name: row.productName ?? "",
			sources: new Set<string>(),
		};
		current.sources.add(row.sourceSlug);
		byEan.set(ean, current);
	}

	return Array.from(byEan.entries())
		.map(([ean, value]) => ({
			ean,
			name: value.name,
			sources: uniqueSorted(Array.from(value.sources)),
			sourceCount: value.sources.size,
		}))
		.toSorted(
			(left, right) =>
				right.sourceCount - left.sourceCount ||
				left.name.localeCompare(right.name, "es"),
		)
		.slice(0, sampleSize);
}

function buildStaleExamples(
	rows: FreshnessBaselineRow[],
	sourceBySlug: Map<string, FreshnessBaselineSource>,
	sampleSize: number,
	now: Date,
) {
	return rows
		.map((row) => {
			const source = sourceBySlug.get(row.sourceSlug);
			const freshness = classifyPriceFreshness(row.lastCheckedAt, {
				now,
				maxAgeHours: source?.freshnessSlaHours ?? 24,
			});

			return { row, freshness };
		})
		.filter((entry) => {
			const rankability = assessRankability(entry.row);
			return entry.freshness.status === "stale" && rankability.isPublicRankable;
		})
		.toSorted(
			(left, right) =>
				(left.row.price ?? Number.MAX_SAFE_INTEGER) -
				(right.row.price ?? Number.MAX_SAFE_INTEGER),
		)
		.slice(0, sampleSize)
		.map((entry) => ({
			ean: entry.row.productEan ?? "",
			name: entry.row.productName ?? "",
			source: entry.row.sourceSlug,
			price: entry.row.price,
			lastCheckedAt: entry.freshness.checkedAt,
		}));
}

function chooseStatus(
	freshnessPercent: number,
	targetPercent: number,
	failUnderPercent: number | null,
	stagingState: FreshnessBaselineStagingState,
	denominatorDeltas: DenominatorDeltaReport,
): FreshnessBaselineStatus {
	if (denominatorDeltas.status === "FAIL") {
		return "FAIL";
	}

	if (failUnderPercent !== null && freshnessPercent < failUnderPercent) {
		return "FAIL";
	}

	if (stagingState.runningRuns > 0 || stagingState.pendingStagingRows > 0) {
		return "WARN";
	}

	return freshnessPercent >= targetPercent ? "PASS" : "WARN";
}

export async function buildFreshnessBaselineReport({
	repository,
	sourceSlugs = [],
	sampleSize = 10,
	now = new Date(),
	targetPercent = 95,
	failUnderPercent = null,
	denominatorDelta = {},
}: FreshnessBaselineOptions): Promise<FreshnessBaselineReport> {
	const sources = await repository.listSources(
		sourceSlugs.length > 0 ? sourceSlugs : undefined,
	);
	const foundSlugs = new Set(sources.map((source) => source.slug));
	const missingSlugs = sourceSlugs.filter((slug) => !foundSlugs.has(slug));

	if (missingSlugs.length > 0) {
		throw new Error(`unknown source slug(s): ${missingSlugs.join(",")}`);
	}

	const selectedSlugs = sources.map((source) => source.slug);
	const [rows, stagingState] = await Promise.all([
		repository.listRows(selectedSlugs),
		repository.getStagingState(),
	]);
	const rowsBySource = new Map<string, FreshnessBaselineRow[]>();

	for (const row of rows) {
		const bucket = rowsBySource.get(row.sourceSlug) ?? [];
		bucket.push(row);
		rowsBySource.set(row.sourceSlug, bucket);
	}

	const sourceSummaries = sources.map((source) =>
		summarizeSource(
			source,
			rowsBySource.get(source.slug) ?? [],
			sampleSize,
			now,
		),
	);
	const summary = sourceSummaries.reduce(
		(accumulator, source) => ({
			sourceCount: accumulator.sourceCount + 1,
			totalRows: accumulator.totalRows + source.totalRows,
			freshRows: accumulator.freshRows + source.freshRows,
			staleRows: accumulator.staleRows + source.staleRows,
			unknownRows: accumulator.unknownRows + source.unknownRows,
			unavailableRows: accumulator.unavailableRows + source.unavailableRows,
			overallFreshnessPercent: 0,
		}),
		{
			sourceCount: 0,
			totalRows: 0,
			freshRows: 0,
			staleRows: 0,
			unknownRows: 0,
			unavailableRows: 0,
			overallFreshnessPercent: 0,
		},
	);
	summary.overallFreshnessPercent = percent(
		summary.freshRows,
		summary.totalRows,
	);
	const sourceBySlug = new Map(sources.map((source) => [source.slug, source]));
	const globalExclusions = sourceSummaries.reduce(
		(accumulator, source) => ({
			unavailable:
				accumulator.unavailable + source.exclusionBuckets.unavailable,
			missingPrice:
				accumulator.missingPrice + source.exclusionBuckets.missingPrice,
			invalidPrice:
				accumulator.invalidPrice + source.exclusionBuckets.invalidPrice,
			missingProductName:
				accumulator.missingProductName +
				source.exclusionBuckets.missingProductName,
			missingProductEan:
				accumulator.missingProductEan +
				source.exclusionBuckets.missingProductEan,
			unknownNonRankable:
				accumulator.unknownNonRankable +
				source.exclusionBuckets.unknownNonRankable,
		}),
		createEmptyExclusionBuckets(),
	);
	const publicRankableRows = sourceSummaries.reduce(
		(total, source) => total + source.publicRankableRows,
		0,
	);
	const excludedRows = sourceSummaries.reduce(
		(total, source) => total + source.excludedRows,
		0,
	);
	const currentDenominatorSnapshot: DenominatorDeltaSnapshot = {
		globalPublicRankableRows: publicRankableRows,
		sources: sourceSummaries.map((source) => ({
			slug: source.slug,
			publicRankableRows: source.publicRankableRows,
		})),
	};
	const denominatorDeltas = evaluateFreshnessDenominatorDeltas({
		current: currentDenominatorSnapshot,
		...denominatorDelta,
	});

	return {
		schemaVersion: 1,
		audit: "freshness-baseline",
		generatedAt: now.toISOString(),
		filters: {
			sources: selectedSlugs,
			sampleSize,
			basis: "production",
			targetPercent,
			failUnderPercent,
		},
		status: chooseStatus(
			summary.overallFreshnessPercent,
			targetPercent,
			failUnderPercent,
			stagingState,
			denominatorDeltas,
		),
		summary,
		denominatorDeltas,
		denominators: {
			primary: {
				publicRankableRows,
				excludedRows,
				exclusionBucketSemantics: "reasonCounts",
				exclusionBuckets: {
					global: globalExclusions,
					bySource: sourceSummaries.map((source) => ({
						slug: source.slug,
						totalRows: source.totalRows,
						publicRankableRows: source.publicRankableRows,
						excludedRows: source.excludedRows,
						...source.exclusionBuckets,
					})),
				},
			},
			secondary: {
				allExistingRows: summary.totalRows,
			},
		},
		sources: sourceSummaries,
		eanOverlap: buildEanOverlap(rows, sampleSize),
		stalePublicRankingExamples: buildStaleExamples(
			rows,
			sourceBySlug,
			sampleSize,
			now,
		),
		stagingState,
	};
}
