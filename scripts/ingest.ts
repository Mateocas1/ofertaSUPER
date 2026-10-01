import "./load-env";

import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";
import pLimit from "p-limit";

import { db } from "../src/lib/db";
import {
	assertSafeIngestionOptions,
	parseIngestionOptions,
	shouldFailForRequestedSourceHealth,
} from "./ingest-options";
import { runHealthCheck } from "./pipeline/health-check";
import { evaluateAndSendIngestionAlerts } from "./pipeline/metrics";
import {
	assertChunkPreReconcileGate,
	assertPhase4PreReconcileGate,
} from "./pipeline/pre-reconcile-assertions";
import { buildCandidateSnapshotHash } from "./pipeline/candidate-snapshot";
import {
	reconcileStageProducts,
	type ReconcileSummary,
} from "./pipeline/reconcile";
import { stageSourceProducts } from "./pipeline/stage";
import {
	validateStageProducts,
	type EvaluatedStageCandidate,
} from "./pipeline/validate";

type SourceSummary = {
	slug: string;
	status: "SUCCESS" | "PARTIAL" | "FAILED";
	timing: {
		healthMs: number;
		stageMs: number;
		validateMs: number;
		reconcileMs: number;
		totalMs: number;
	};
	queriesSent: number;
	productsFetched: number;
	productsStaged: number;
	productsPromoted: number;
	productsRejected: number;
	errorSummary: string | null;
	health: {
		isHealthy: boolean;
		hashValid: boolean;
		errorType: string | null;
		responseTimeMs: number;
		productsReturned: number;
	};
};

type SourceExecution = {
	runId?: number;
	candidateHash: string | null;
	summary: SourceSummary;
	candidates: EvaluatedStageCandidate[];
};

type SourceRunContext = {
	batchId: string;
	dryRun: boolean;
	count: number;
	queryLimit: number;
	queryTerms: string[] | null;
	writeMode: "phase4-count5" | "refresh-existing";
	stageFetchCount: number;
	stageFilterEans: string[] | undefined;
};

type MetricsSummary = Awaited<
	ReturnType<typeof evaluateAndSendIngestionAlerts>
>;

async function getActiveSources(sourceFilter: string[] | null) {
	return db.supermarket.findMany({
		where: {
			is_vtex: true,
			is_active: true,
			...(sourceFilter ? { slug: { in: sourceFilter } } : {}),
		},
		orderBy: {
			name: "asc",
		},
		select: {
			id: true,
			slug: true,
			name: true,
		},
	});
}

async function updateRunSafely(
	runId: number | undefined,
	data: Prisma.IngestionRunUpdateInput,
) {
	if (!runId) {
		return;
	}

	try {
		await db.ingestionRun.update({
			where: { id: runId },
			data,
		});
	} catch (error) {
		console.error(`Failed to persist ingestion run ${runId}`, error);
	}
}

async function evaluateMetricsSafely(sourceSummaries: SourceSummary[]) {
	try {
		return await evaluateAndSendIngestionAlerts({
			sourceSummaries: sourceSummaries.map((summary) => ({
				slug: summary.slug,
				status: summary.status,
				productsStaged: summary.productsStaged,
				productsRejected: summary.productsRejected,
				health: {
					isHealthy: summary.health.isHealthy,
					hashValid: summary.health.hashValid,
					errorType: summary.health.errorType,
				},
			})),
		});
	} catch (error) {
		console.error("Failed to evaluate ingestion metrics", error);
		return null;
	}
}

type IngestionHealthSummary = SourceSummary["health"];

const UNKNOWN_INGESTION_HEALTH: IngestionHealthSummary = {
	isHealthy: false,
	hashValid: false,
	errorType: "unknown",
	responseTimeMs: 0,
	productsReturned: 0,
};

function firstQueryTerm(queryTerms: string[] | null) {
	return queryTerms?.[0] ?? "";
}

async function startIngestionRun(
	source: { id: number; slug: string },
	context: SourceRunContext,
	startedAt: number,
) {
	if (context.dryRun) return undefined;
	const run = await db.ingestionRun.create({
		data: {
			batch_id: context.batchId,
			source_slug: source.slug,
			supermarket_id: source.id,
			started_at: new Date(startedAt),
			status: "RUNNING",
			vtex_hash: process.env.VTEX_SHA256_HASH ?? null,
		},
		select: {
			id: true,
		},
	});
	return run.id;
}

function failedExecution({
	source,
	runId,
	timing,
	errorSummary,
	health,
}: {
	source: { slug: string };
	runId: number | undefined;
	timing: { healthMs: number; stageMs: number; validateMs: number; totalMs: number };
	errorSummary: string;
	health: IngestionHealthSummary;
}): SourceExecution {
	return {
		runId,
		candidateHash: null,
		candidates: [],
		summary: {
			slug: source.slug,
			status: "FAILED",
			timing: {
				healthMs: timing.healthMs,
				stageMs: timing.stageMs,
				validateMs: timing.validateMs,
				reconcileMs: 0,
				totalMs: timing.totalMs,
			},
			queriesSent: 0,
			productsFetched: 0,
			productsStaged: 0,
			productsPromoted: 0,
			productsRejected: 0,
			errorSummary,
			health,
		},
	};
}

function completedExecution({
	source,
	runId,
	status,
	timing,
	stage,
	validation,
	errorSummary,
	health,
	candidateHash,
}: {
	source: { slug: string };
	runId: number | undefined;
	status: "SUCCESS" | "PARTIAL";
	timing: { healthMs: number; stageMs: number; validateMs: number; totalMs: number };
	stage: Awaited<ReturnType<typeof stageSourceProducts>>;
	validation: Awaited<ReturnType<typeof validateStageProducts>>;
	errorSummary: string | null;
	health: IngestionHealthSummary;
	candidateHash: string;
}): SourceExecution {
	return {
		runId,
		candidateHash,
		candidates: validation.candidates,
		summary: {
			slug: source.slug,
			status,
			timing: {
				healthMs: timing.healthMs,
				stageMs: timing.stageMs,
				validateMs: timing.validateMs,
				reconcileMs: 0,
				totalMs: timing.totalMs,
			},
			queriesSent: stage.queriesSent,
			productsFetched: stage.productsFetched,
			productsStaged: stage.productsStaged,
			productsPromoted: 0,
			productsRejected: validation.rejected,
			errorSummary,
			health,
		},
	};
}

async function executeSource(
	source: { id: number; slug: string; name: string },
	context: SourceRunContext,
): Promise<SourceExecution> {
	const startedAt = Date.now();
	let healthMs = 0;
	let stageMs = 0;
	let validateMs = 0;
	const runId = await startIngestionRun(source, context, startedAt);

	try {
		const healthStartedAt = Date.now();
		const health = await runHealthCheck({
			slug: source.slug,
			dryRun: context.dryRun,
		});
		healthMs = Date.now() - healthStartedAt;

		if (!health.isHealthy) {
			const durationMs = Date.now() - startedAt;
			const errorSummary = health.errorType ?? "health_check_failed";
			await updateRunSafely(runId, {
				finished_at: new Date(),
				duration_ms: durationMs,
				status: "FAILED",
				error_summary: errorSummary,
			});
			return failedExecution({
				source,
				runId,
				timing: { healthMs, stageMs, validateMs, totalMs: durationMs },
				errorSummary,
				health: {
					isHealthy: health.isHealthy,
					hashValid: health.hashValid,
					errorType: health.errorType,
					responseTimeMs: health.responseTimeMs,
					productsReturned: health.productsReturned,
				},
			});
		}

		const stageStartedAt = Date.now();
		const stage = await stageSourceProducts({
			runId,
			slug: source.slug,
			dryRun: context.dryRun,
			queryLimit: context.queryLimit,
			queryTerms: context.queryTerms ?? undefined,
			count: context.stageFetchCount,
			filterEans: context.stageFilterEans,
		});
		stageMs = Date.now() - stageStartedAt;

		const validateStartedAt = Date.now();
		const validation = await validateStageProducts({
			runId,
			slug: source.slug,
			products: context.dryRun ? stage.products : undefined,
			dryRun: context.dryRun,
		});
		validateMs = Date.now() - validateStartedAt;
		const status = validation.rejected > 0 ? "PARTIAL" : "SUCCESS";
		const errorSummary =
			validation.rejected > 0
				? `${validation.rejected} records rejected by quality gates`
				: null;
		const executionCandidateHash = buildCandidateSnapshotHash({
			source: source.slug,
			term: firstQueryTerm(context.queryTerms),
			count: context.count,
			queryLimit: context.queryLimit,
			writeMode: context.writeMode,
			candidates: validation.candidates,
		});
		const durationMs = Date.now() - startedAt;

		await updateRunSafely(runId, {
			finished_at: new Date(),
			duration_ms: durationMs,
			status,
			queries_sent: stage.queriesSent,
			products_fetched: stage.productsFetched,
			products_staged: stage.productsStaged,
			products_rejected: validation.rejected,
			products_promoted: 0,
			error_summary: errorSummary,
		});

		return completedExecution({
			source,
			runId,
			status,
			timing: { healthMs, stageMs, validateMs, totalMs: durationMs },
			stage,
			validation,
			errorSummary,
			health: {
				isHealthy: health.isHealthy,
				hashValid: health.hashValid,
				errorType: health.errorType,
				responseTimeMs: health.responseTimeMs,
				productsReturned: health.productsReturned,
			},
			candidateHash: executionCandidateHash,
		});
	} catch (error) {
		const durationMs = Date.now() - startedAt;
		const message =
			error instanceof Error ? error.message : "unknown_ingestion_error";
		await updateRunSafely(runId, {
			finished_at: new Date(),
			duration_ms: durationMs,
			status: "FAILED",
			error_summary: message,
		});
		return failedExecution({
			source,
			runId,
			timing: { healthMs, stageMs, validateMs, totalMs: durationMs },
			errorSummary: message,
			health: UNKNOWN_INGESTION_HEALTH,
		});
	}
}

function resolveStageOptions({
	candidateSelection,
	count,
	scanCount,
	expectedEans,
}: {
	candidateSelection: "strict" | "existing-only";
	count: number;
	scanCount: number;
	expectedEans: string[] | null;
}) {
	return {
		stageFetchCount:
			candidateSelection === "existing-only" ? scanCount : count,
		stageFilterEans:
			candidateSelection === "existing-only"
				? expectedEans ?? undefined
				: undefined,
	};
}

async function assertPreReconcile({
	expectedEans,
	candidateHash,
	writeMode,
	executions,
	dryRun,
}: {
	expectedEans: string[];
	candidateHash: string | null;
	writeMode: "phase4-count5" | "refresh-existing";
	executions: SourceExecution[];
	dryRun: boolean;
}) {
	try {
		if (writeMode === "refresh-existing") {
			assertChunkPreReconcileGate({
				expectedEans,
				expectedCandidateHash: candidateHash,
				executions,
			});
		} else {
			assertPhase4PreReconcileGate({
				expectedEans,
				executions,
			});
		}
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: "pre_reconcile_assertion_failed";

		if (!dryRun) {
			await Promise.all(
				executions
					.filter(
						(execution) =>
							execution.runId && execution.summary.status !== "FAILED",
					)
					.map((execution) =>
						updateRunSafely(execution.runId, {
							finished_at: new Date(),
							status: "FAILED",
							error_summary: message,
						}),
					),
			);
		}

		throw error;
	}
}

function reconcileRequest({
	dryRun,
	batchId,
	executions,
	writeMode,
	reconcileBatchSize,
}: {
	dryRun: boolean;
	batchId: string;
	executions: SourceExecution[];
	writeMode: "phase4-count5" | "refresh-existing";
	reconcileBatchSize: number;
}): Parameters<typeof reconcileStageProducts>[0] {
	return {
		batchId: dryRun ? undefined : batchId,
		batchSize: reconcileBatchSize,
		candidates: dryRun
			? executions.flatMap((execution) => execution.candidates)
			: undefined,
		dryRun,
		writeMode: writeMode === "refresh-existing" ? "refresh-existing" : "standard",
	};
}

function applyReconcileTimings(
	executions: SourceExecution[],
	reconcileSummary: ReconcileSummary,
	reconcileMs: number,
) {
	const totalPromoted = Math.max(reconcileSummary.promoted, 1);

	for (const execution of executions) {
		const promotedForSource =
			reconcileSummary.promotedBySource[execution.summary.slug] ?? 0;
		execution.summary.productsPromoted = promotedForSource;
		execution.summary.timing.reconcileMs =
			promotedForSource > 0
				? Math.round(reconcileMs * (promotedForSource / totalPromoted))
				: 0;
		execution.summary.timing.totalMs =
			execution.summary.timing.healthMs +
			execution.summary.timing.stageMs +
			execution.summary.timing.validateMs +
			execution.summary.timing.reconcileMs;
	}
}

async function persistPromotedCounts(
	executions: SourceExecution[],
	reconcileSummary: ReconcileSummary,
	dryRun: boolean,
) {
	if (dryRun) return;

	await Promise.all(
		executions
			.filter(
				(execution) =>
					execution.runId && execution.summary.status !== "FAILED",
			)
			.map((execution) =>
				updateRunSafely(execution.runId, {
					products_promoted:
						reconcileSummary.promotedByRunId[String(execution.runId)] ?? 0,
				}),
			),
	);
}

async function runActiveReconcile({
	mode,
	requestedSourceHealthFailed,
	expectedEans,
	candidateHash,
	writeMode,
	executions,
	dryRun,
	batchId,
	reconcileBatchSize,
}: {
	mode: "off" | "shadow" | "active";
	requestedSourceHealthFailed: boolean;
	expectedEans: string[] | null;
	candidateHash: string | null;
	writeMode: "phase4-count5" | "refresh-existing";
	executions: SourceExecution[];
	dryRun: boolean;
	batchId: string;
	reconcileBatchSize: number;
}): Promise<{ reconcileSummary: ReconcileSummary | null; reconcileMs: number }> {
	if (mode !== "active" || requestedSourceHealthFailed) {
		return { reconcileSummary: null, reconcileMs: 0 };
	}

	if (expectedEans?.length) {
		await assertPreReconcile({
			expectedEans,
			candidateHash,
			writeMode,
			executions,
			dryRun,
		});
	}

	const reconcileStartedAt = Date.now();
	const reconcileSummary = await reconcileStageProducts(
		reconcileRequest({
			dryRun,
			batchId,
			executions,
			writeMode,
			reconcileBatchSize,
		}),
	);
	const reconcileMs = Date.now() - reconcileStartedAt;

	applyReconcileTimings(executions, reconcileSummary, reconcileMs);
	await persistPromotedCounts(executions, reconcileSummary, dryRun);

	return { reconcileSummary, reconcileMs };
}

function buildIngestionReport({
	batchId,
	mode,
	writeMode,
	candidateSelection,
	stageFetchCount,
	dryRun,
	totalPipelineMs,
	reconcileMs,
	sources,
	requestedSourceHealthFailed,
	summaries,
	reconcileSummary,
	metricsSummary,
	executions,
}: {
	batchId: string;
	mode: "off" | "shadow" | "active";
	writeMode: "phase4-count5" | "refresh-existing";
	candidateSelection: "strict" | "existing-only";
	stageFetchCount: number;
	dryRun: boolean;
	totalPipelineMs: number;
	reconcileMs: number;
	sources: Array<{ id: number; slug: string; name: string }>;
	requestedSourceHealthFailed: boolean;
	summaries: SourceSummary[];
	reconcileSummary: ReconcileSummary | null;
	metricsSummary: MetricsSummary | null;
	executions: SourceExecution[];
}): Record<string, unknown> {
	return {
	batchId,
	mode,
	writeMode,
	candidateSelection,
	scanCount: stageFetchCount,
	dryRun,
	timing: {
		totalPipelineMs,
		reconcileMs,
	},
	sourceCount: sources.length,
	requestedSourceHealthFailed,
	totals: {
		fetched: summaries.reduce(
			(total, summary) => total + summary.productsFetched,
			0,
		),
		staged: summaries.reduce(
			(total, summary) => total + summary.productsStaged,
			0,
		),
		promoted: summaries.reduce(
			(total, summary) => total + summary.productsPromoted,
			0,
		),
		rejected: summaries.reduce(
			(total, summary) => total + summary.productsRejected,
			0,
		),
		failedSources: summaries.filter(
			(summary) => summary.status === "FAILED",
		).length,
	},
	reconciliation: reconcileSummary,
	metrics: metricsSummary,
	sources: executions.map((execution) => ({
		runId: execution.runId ?? null,
		candidateHash: execution.candidateHash,
		...execution.summary,
	})),
	};
}

async function main() {
	const options = parseIngestionOptions();
	assertSafeIngestionOptions(options);

	const {
		count,
		dryRun,
		mode,
		queryLimit,
		queryTerms,
		expectedEans,
		candidateHash,
		writeMode,
		candidateSelection,
		scanCount,
		reconcileBatchSize,
		sourceFilter,
	} = options;

	if (mode === "off") {
		console.log(
			JSON.stringify(
				{ mode, skipped: true, reason: "INGESTION_V2=off" },
				null,
				2,
			),
		);
		return;
	}

	const batchId = randomUUID();
	const pipelineStartedAt = Date.now();
	const sources = await getActiveSources(sourceFilter);
	const limit = pLimit(2);
	const { stageFetchCount, stageFilterEans } = resolveStageOptions({
		candidateSelection,
		count,
		scanCount,
		expectedEans,
	});
	const context: SourceRunContext = {
		batchId,
		dryRun,
		count,
		queryLimit,
		queryTerms,
		writeMode,
		stageFetchCount,
		stageFilterEans,
	};

	const executions = await Promise.all(
		sources.map((source) => limit(() => executeSource(source, context))),
	);

	const summaries = executions.map((execution) => execution.summary);
	const requestedSourceHealthFailed = shouldFailForRequestedSourceHealth(
		sourceFilter,
		summaries,
	);

	const { reconcileSummary, reconcileMs } = await runActiveReconcile({
		mode,
		requestedSourceHealthFailed,
		expectedEans,
		candidateHash,
		writeMode,
		executions,
		dryRun,
		batchId,
		reconcileBatchSize,
	});

	const metricsSummary = dryRun ? null : await evaluateMetricsSafely(summaries);

	const totalPipelineMs = Date.now() - pipelineStartedAt;

	console.log(
		JSON.stringify(
			buildIngestionReport({
				batchId,
				mode,
				writeMode,
				candidateSelection,
				stageFetchCount,
				dryRun,
				totalPipelineMs,
				reconcileMs,
				sources,
				requestedSourceHealthFailed,
				summaries,
				reconcileSummary,
				metricsSummary,
				executions,
			}),
			null,
			2,
		),
	);

	if (requestedSourceHealthFailed) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
