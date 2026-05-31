type Status = "PASS" | "FAIL";
type Recommendation = "continue-to-pr2b-direct-refresh-feasibility" | "stop-scheduler-work-and-run-pr2b-readonly-feasibility";
type SourceDenominator = { slug: string; publicRankableRows: number };

export type RefreshThroughputInput = {
	basis: string;
	targetPercent: number;
	primaryDenominatorRows?: number;
	secondaryDenominatorRows?: number;
	sourceDenominators?: SourceDenominator[];
};

export type RefreshThroughputAssumptions = {
	rowsPerChunk: number;
	chunksPerRun: number;
	cadenceHours: number;
	slaHours: number;
	skipMarginRuns: number;
	p50RuntimeMinutes: number;
	p95RuntimeMinutes: number;
	maxRuntimeMinutes: number;
	githubTimeoutMinutes: number;
	rateLimitRequestsPerMinute: number;
	minTimeoutMarginMinutes?: number;
};

export type RefreshThroughputReport = {
	schemaVersion: 1;
	audit: "refresh-throughput";
	status: Status;
	basis: "production";
	targetPercent: number;
	primaryDenominatorRows: number;
	sourceOrder: SourceDenominator[];
	capacity: Record<string, number>;
	runtime: Record<string, number>;
	rateLimit: { requestsPerMinute: number };
	stopConditions: string[];
	recommendation: Recommendation;
};

export function buildRefreshThroughputReport({ input, assumptions }: { input: RefreshThroughputInput; assumptions: RefreshThroughputAssumptions }): RefreshThroughputReport {
	const primaryDenominatorRows = validateInput(input);
	validateAssumptions(assumptions);
	const plannedRunsPerSla = Math.floor(assumptions.slaHours / assumptions.cadenceHours);
	const successfulRunsPerSla = Math.max(0, plannedRunsPerSla - assumptions.skipMarginRuns);
	const coverableRowsPerRun = assumptions.rowsPerChunk * assumptions.chunksPerRun;
	const coverableRowsPerSla = coverableRowsPerRun * successfulRunsPerSla;
	const requiredRows = Math.ceil(primaryDenominatorRows * (input.targetPercent / 100));
	const minTimeoutMarginMinutes = assumptions.minTimeoutMarginMinutes ?? 10;
	const timeoutMarginMinutes = assumptions.githubTimeoutMinutes - assumptions.p95RuntimeMinutes;
	const stopConditions = [
		coverableRowsPerSla < requiredRows ? `capacity covers ${coverableRowsPerSla} of ${requiredRows} required rows` : null,
		timeoutMarginMinutes < minTimeoutMarginMinutes ? `p95 runtime margin ${timeoutMarginMinutes}m is below ${minTimeoutMarginMinutes}m` : null,
		assumptions.maxRuntimeMinutes > assumptions.githubTimeoutMinutes ? `max runtime exceeds GitHub timeout (${assumptions.maxRuntimeMinutes}m > ${assumptions.githubTimeoutMinutes}m)` : null,
	].filter((condition): condition is string => Boolean(condition));
	const recommendation: Recommendation = stopConditions.length > 0 ? "stop-scheduler-work-and-run-pr2b-readonly-feasibility" : "continue-to-pr2b-direct-refresh-feasibility";
	return {
		schemaVersion: 1,
		audit: "refresh-throughput",
		status: stopConditions.length > 0 ? "FAIL" : "PASS",
		basis: "production",
		targetPercent: input.targetPercent,
		primaryDenominatorRows,
		sourceOrder: [...(input.sourceDenominators ?? [])].sort((a, b) => b.publicRankableRows - a.publicRankableRows || a.slug.localeCompare(b.slug)),
		capacity: { rowsPerChunk: assumptions.rowsPerChunk, chunksPerRun: assumptions.chunksPerRun, plannedRunsPerSla, skipMarginRuns: assumptions.skipMarginRuns, successfulRunsPerSla, coverableRowsPerRun, coverableRowsPerSla, requiredRows, coveragePercent: percent(coverableRowsPerSla, primaryDenominatorRows) },
		runtime: { p50RuntimeMinutes: assumptions.p50RuntimeMinutes, p95RuntimeMinutes: assumptions.p95RuntimeMinutes, maxRuntimeMinutes: assumptions.maxRuntimeMinutes, githubTimeoutMinutes: assumptions.githubTimeoutMinutes, timeoutMarginMinutes, minTimeoutMarginMinutes },
		rateLimit: { requestsPerMinute: assumptions.rateLimitRequestsPerMinute },
		stopConditions,
		recommendation,
	};
}

export function inputFromFreshnessBaselineReport(report: unknown): RefreshThroughputInput {
	const filters = asRecord(asRecord(report).filters);
	const denominators = asRecord(asRecord(report).denominators);
	const primary = asRecord(denominators.primary);
	const secondary = asRecord(denominators.secondary);
	const bySource = asRecord(primary.exclusionBuckets).bySource;
	return {
		basis: String(filters.basis ?? ""),
		targetPercent: Number(filters.targetPercent ?? 95),
		primaryDenominatorRows: Number(primary.publicRankableRows),
		secondaryDenominatorRows: Number(secondary.allExistingRows),
		sourceDenominators: (Array.isArray(bySource) ? bySource : []).map((entry) => {
			const source = asRecord(entry);
			return { slug: String(source.slug), publicRankableRows: Number(source.publicRankableRows) };
		}),
	};
}

function validateInput(input: RefreshThroughputInput) {
	if (input.basis !== "production") throw new Error("throughput input basis must be production");
	if (!Number.isFinite(input.targetPercent) || input.targetPercent < 95) throw new Error("throughput target percent must be at least 95");
	if (!Number.isFinite(input.primaryDenominatorRows) || (input.primaryDenominatorRows ?? 0) <= 0) throw new Error("throughput input requires a positive primary denominator");
	return input.primaryDenominatorRows as number;
}

function validateAssumptions(assumptions: RefreshThroughputAssumptions) {
	for (const [key, value] of Object.entries(assumptions)) {
		if (!Number.isFinite(value) || value < 0) throw new Error(`throughput assumption ${key} must be non-negative`);
	}
	for (const key of ["rowsPerChunk", "chunksPerRun", "cadenceHours", "slaHours", "githubTimeoutMinutes"] as const) {
		if (assumptions[key] <= 0) throw new Error(`throughput assumption ${key} must be positive`);
	}
}

function percent(part: number, total: number) {
	return total > 0 ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
