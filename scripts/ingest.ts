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
	const stageFetchCount =
		candidateSelection === "existing-only" ? scanCount : count;
	const stageFilterEans =
		candidateSelection === "existing-only" ? expectedEans ?? undefined : undefined;

	const executions = await Promise.all(
		sources.map((source) =>
			limit(async (): Promise<SourceExecution> => {
				const startedAt = Date.now();
				let healthMs = 0;
				let stageMs = 0;
				let validateMs = 0;
				let runId: number | undefined;

				if (!dryRun) {
					const run = await db.ingestionRun.create({
						data: {
							batch_id: batchId,
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
					runId = run.id;
				}

				try {
					const healthStartedAt = Date.now();
					const health = await runHealthCheck({
						slug: source.slug,
						dryRun,
					});
					healthMs = Date.now() - healthStartedAt;

					if (!health.isHealthy) {
						const durationMs = Date.now() - startedAt;

						if (!dryRun) {
							await updateRunSafely(runId, {
								finished_at: new Date(),
								duration_ms: durationMs,
								status: "FAILED",
								error_summary: health.errorType ?? "health_check_failed",
							});
						}

						return {
							runId,
							candidateHash: null,
							candidates: [],
							summary: {
								slug: source.slug,
								status: "FAILED",
								timing: {
									healthMs,
									stageMs,
									validateMs,
									reconcileMs: 0,
									totalMs: durationMs,
								},
								queriesSent: 0,
								productsFetched: 0,
								productsStaged: 0,
								productsPromoted: 0,
								productsRejected: 0,
								errorSummary: health.errorType ?? "health_check_failed",
								health: {
									isHealthy: health.isHealthy,
									hashValid: health.hashValid,
									errorType: health.errorType,
									responseTimeMs: health.responseTimeMs,
									productsReturned: health.productsReturned,
								},
							},
						};
					}

					const stageStartedAt = Date.now();
					const stage = await stageSourceProducts({
						runId,
						slug: source.slug,
						dryRun,
						queryLimit,
						queryTerms: queryTerms ?? undefined,
						count: stageFetchCount,
						filterEans: stageFilterEans,
					});
					stageMs = Date.now() - stageStartedAt;

					const validateStartedAt = Date.now();
					const validation = await validateStageProducts({
						runId,
						slug: source.slug,
						products: dryRun ? stage.products : undefined,
						dryRun,
					});
					validateMs = Date.now() - validateStartedAt;
					const status = validation.rejected > 0 ? "PARTIAL" : "SUCCESS";
					const executionCandidateHash = buildCandidateSnapshotHash({
						source: source.slug,
						term: queryTerms?.[0] ?? "",
						count,
						queryLimit,
						writeMode,
						candidates: validation.candidates,
					});
					const durationMs = Date.now() - startedAt;

					if (!dryRun) {
						await updateRunSafely(runId, {
							finished_at: new Date(),
							duration_ms: durationMs,
							status,
							queries_sent: stage.queriesSent,
							products_fetched: stage.productsFetched,
							products_staged: stage.productsStaged,
							products_rejected: validation.rejected,
							products_promoted: 0,
							error_summary:
								validation.rejected > 0
									? `${validation.rejected} records rejected by quality gates`
									: null,
						});
					}

					return {
						runId,
						candidateHash: executionCandidateHash,
						candidates: validation.candidates,
						summary: {
							slug: source.slug,
							status,
							timing: {
								healthMs,
								stageMs,
								validateMs,
								reconcileMs: 0,
								totalMs: durationMs,
							},
							queriesSent: stage.queriesSent,
							productsFetched: stage.productsFetched,
							productsStaged: stage.productsStaged,
							productsPromoted: 0,
							productsRejected: validation.rejected,
							errorSummary:
								validation.rejected > 0
									? `${validation.rejected} records rejected by quality gates`
									: null,
							health: {
								isHealthy: health.isHealthy,
								hashValid: health.hashValid,
								errorType: health.errorType,
								responseTimeMs: health.responseTimeMs,
								productsReturned: health.productsReturned,
							},
						},
					};
				} catch (error) {
					const durationMs = Date.now() - startedAt;
					const message =
						error instanceof Error ? error.message : "unknown_ingestion_error";

					if (!dryRun) {
						await updateRunSafely(runId, {
							finished_at: new Date(),
							duration_ms: durationMs,
							status: "FAILED",
							error_summary: message,
						});
					}

					return {
						runId,
						candidateHash: null,
						candidates: [],
						summary: {
							slug: source.slug,
							status: "FAILED",
							timing: {
								healthMs,
								stageMs,
								validateMs,
								reconcileMs: 0,
								totalMs: durationMs,
							},
							queriesSent: 0,
							productsFetched: 0,
							productsStaged: 0,
							productsPromoted: 0,
							productsRejected: 0,
							errorSummary: message,
							health: {
								isHealthy: false,
								hashValid: false,
								errorType: "unknown",
								responseTimeMs: 0,
								productsReturned: 0,
							},
						},
					};
				}
			}),
		),
	);

	const summaries = executions.map((execution) => execution.summary);
	const requestedSourceHealthFailed = shouldFailForRequestedSourceHealth(
		sourceFilter,
		summaries,
	);

	let reconcileSummary: ReconcileSummary | null = null;
	let reconcileMs = 0;
	let metricsSummary: MetricsSummary | null = null;

	if (mode === "active" && !requestedSourceHealthFailed) {
		if (expectedEans?.length) {
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

		const reconcileStartedAt = Date.now();
		reconcileSummary = await reconcileStageProducts({
			batchId: dryRun ? undefined : batchId,
			batchSize: reconcileBatchSize,
			candidates: dryRun
				? executions.flatMap((execution) => execution.candidates)
				: undefined,
			dryRun,
			writeMode:
				writeMode === "refresh-existing" ? "refresh-existing" : "standard",
		});
		reconcileMs = Date.now() - reconcileStartedAt;
		const activeReconcileSummary = reconcileSummary;

		const totalPromoted = Math.max(activeReconcileSummary.promoted, 1);

		for (const execution of executions) {
			execution.summary.productsPromoted =
				activeReconcileSummary.promotedBySource[execution.summary.slug] ?? 0;
			const promotedForSource =
				activeReconcileSummary.promotedBySource[execution.summary.slug] ?? 0;
			const ratio = promotedForSource / totalPromoted;
			execution.summary.timing.reconcileMs =
				promotedForSource > 0 ? Math.round(reconcileMs * ratio) : 0;
			execution.summary.timing.totalMs =
				execution.summary.timing.healthMs +
				execution.summary.timing.stageMs +
				execution.summary.timing.validateMs +
				execution.summary.timing.reconcileMs;
		}

		if (!dryRun) {
			await Promise.all(
				executions
					.filter(
						(execution) =>
							execution.runId && execution.summary.status !== "FAILED",
					)
					.map((execution) =>
						updateRunSafely(execution.runId, {
							products_promoted:
								activeReconcileSummary.promotedByRunId[
									String(execution.runId)
								] ?? 0,
						}),
					),
			);
		}
	}

	if (!dryRun) {
		metricsSummary = await evaluateMetricsSafely(summaries);
	}

	const totalPipelineMs = Date.now() - pipelineStartedAt;

	console.log(
		JSON.stringify(
			{
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
			},
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
