export type OpsFreshnessRepository = {
	findRunningRuns(cutoffIso: string): Promise<Array<{ id: number; sourceSlug: string; startedAt: string }>>;
	countOldPendingStagingRows(cutoffIso: string): Promise<number>;
};

export type OpsFreshnessReport = {
	schemaVersion: 1;
	audit: "ops-freshness";
	generatedAt: string;
	status: "PASS" | "WARN";
	thresholds: {
		runningRunMaxAgeMinutes: number;
		pendingStagingMaxAgeMinutes: number;
	};
	checks: {
		stuckRunningRuns: {
			status: "PASS" | "WARN";
			count: number;
			runs: Array<{ id: number; sourceSlug: string; startedAt: string }>;
		};
		oldPendingStagingRows: {
			status: "PASS" | "WARN";
			count: number;
		};
		redis: {
			status: "pass" | "degraded";
			reason: string | null;
			latencyMs: number | null;
		};
	};
};

function minutesAgo(now: Date, minutes: number) {
	return new Date(now.getTime() - minutes * 60_000).toISOString();
}

export async function buildOpsFreshnessReport({
	repository,
	redisProbe,
	now = new Date(),
	runningRunMaxAgeMinutes = 60,
	pendingStagingMaxAgeMinutes = 60,
}: {
	repository: OpsFreshnessRepository;
	redisProbe: () => Promise<OpsFreshnessReport["checks"]["redis"]>;
	now?: Date;
	runningRunMaxAgeMinutes?: number;
	pendingStagingMaxAgeMinutes?: number;
}): Promise<OpsFreshnessReport> {
	const [runningRuns, oldPendingStagingRows, redis] = await Promise.all([
		repository.findRunningRuns(minutesAgo(now, runningRunMaxAgeMinutes)),
		repository.countOldPendingStagingRows(minutesAgo(now, pendingStagingMaxAgeMinutes)),
		redisProbe(),
	]);
	const stuckStatus = runningRuns.length > 0 ? "WARN" : "PASS";
	const pendingStatus = oldPendingStagingRows > 0 ? "WARN" : "PASS";
	const status = stuckStatus === "WARN" || pendingStatus === "WARN" || redis.status === "degraded" ? "WARN" : "PASS";

	return {
		schemaVersion: 1,
		audit: "ops-freshness",
		generatedAt: now.toISOString(),
		status,
		thresholds: { runningRunMaxAgeMinutes, pendingStagingMaxAgeMinutes },
		checks: {
			stuckRunningRuns: {
				status: stuckStatus,
				count: runningRuns.length,
				runs: runningRuns,
			},
			oldPendingStagingRows: {
				status: pendingStatus,
				count: oldPendingStagingRows,
			},
			redis,
		},
	};
}
