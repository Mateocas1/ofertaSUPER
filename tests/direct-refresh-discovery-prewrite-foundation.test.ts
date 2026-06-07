import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256,
	evaluateDirectRefreshDiscoveryPrewriteFoundation,
	parseDirectRefreshDiscoveryPrewriteFoundationCliOptions,
	parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson,
	parseDirectRefreshDiscoverySourceConfigSnapshotFiles,
	type DirectRefreshDiscoveryPrewriteFoundationEvidence,
} from "../scripts/pipeline/direct-refresh-discovery-prewrite-foundation";

const completeEvidence: DirectRefreshDiscoveryPrewriteFoundationEvidence = {
	generatedAt: "2026-06-06T12:25:00.000Z",
	schemaConstraints: {
		productEanPrimaryKey: true,
		productSourceUnique: true,
		sourceSkuUniqueNonnull: true,
		priceHistoryIndex: true,
		stagingProductIndex: true,
		ledgerUniqueness: true,
		migrationStatus: "PASS",
	},
	controlPlane: {
		sourceLock: true,
		ledgerAttemptIdentity: true,
		ttlPolicy: true,
		owner: "direct-refresh-oncall",
		stopResumeStates: true,
		idempotencyPolicy: true,
	},
	artifactLineage: {
		issue: 185,
		source: "vea",
		count: 1,
		attemptId: "foundation-attempt-001",
		artifactPath:
			"audit/direct-refresh-discovery-prewrite-foundation/issue-185/vea/count1/foundation-attempt-001/foundation-evidence.json",
		artifactSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		gitCommit: "ccc7535",
		toolVersion: "direct-refresh-discovery-create@1",
		schemaVersion: "1",
		dbEnvironmentIdentity: "local-test-db",
		sourceConfigSnapshot:
			"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; files:src/lib/supermarkets.ts",
		vtexProbeSource: "vea",
		vtexProbeHash:
			"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		vtexProbeTimestamp: "2026-06-06T12:25:00.000Z",
	},
	rollbackDrill: {
		executed: true,
		mode: "controlled-disposable-row",
		rollbackIds: ["supermarket_products:901", "price_history:1001"],
		postRollbackVerification: true,
		postRollbackVerificationArtifact:
			"audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json",
		postRollbackVerificationSha256:
			"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		preimageCaptured: true,
		preimageArtifact:
			"audit/direct-refresh-discovery-rollback-verification/preimage.json",
		preimageSha256:
			"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		pitrBackupPosture: "Supabase PITR/backup posture reviewed before write",
		cacheHandling: "No cache purge needed for disposable-row drill; public cache TTL reviewed",
	},
	vtexBudgets: {
		requestCap: 20,
		concurrency: 1,
		timeoutMs: 10_000,
		backoffPolicy: "backoff on timeout/403/429/HTML/captcha",
		stopRule: "source STOPPED on blocked/rate-limit/hash_invalid; no automatic retry",
		headerPolicy: "documented non-evasive headers",
	},
	compliance: {
		allowedUseReviewed: true,
		posture: "approved",
		reviewedSources: ["vea"],
	},
	alertChannel: {
		channel: "Issue comment + #direct-refresh-alerts",
		owner: "direct-refresh-oncall",
		severity: "critical write/postwrite/rollback-required",
		ackSla: "ack SLA <= 30m",
		resolutionSla: "resolution SLA <= 4h",
		escalationPath: "escalate to direct-refresh-oncall then data-platform-oncall",
		suppressionPolicy: "suppression/noise policy: no suppression for rollback-required",
		retryPolicy: "retry policy: no automatic retry after rollback-required",
		testAlertProof: "test-alert proof captured in issue evidence comment",
		writeFailure: true,
		postwriteFailure: true,
		rollbackRequired: true,
	},
	performanceGuard: {
		prismaPoolPosture: "pgbouncer=true; connection_limit=3; pool_timeout=10",
		transactionTimeoutPosture:
			"statement_timeout=2min; idle_in_transaction_session_timeout=0",
		priceHistoryBaseline: "PriceHistory insert/read baseline captured",
		publicApiBaseline: "public API search/products baseline captured",
		cacheTtlBaseline: "TTL baseline captured",
	},
};

completeEvidence.artifactLineage.artifactSha256 =
	calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
		completeEvidence,
	);

function evaluateFoundation(input: {
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence;
	evidencePath?: string;
	evidenceSha256?: string;
	sourceConfigSnapshotSha256?: string;
	rollbackPreimageSha256?: string;
	postRollbackVerificationSha256?: string;
	now?: Date;
}) {
	return evaluateDirectRefreshDiscoveryPrewriteFoundation({
		evidence: input.evidence,
		evidencePath:
			input.evidencePath ??
			input.evidence.artifactLineage?.artifactPath ??
			"foundation.json",
		evidenceSha256:
			input.evidenceSha256 ??
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				input.evidence,
			) ??
			"sha256:0000000000000000000000000000000000000000000000000000000000000000",
		sourceConfigSnapshotSha256:
			input.sourceConfigSnapshotSha256 ??
			input.evidence.artifactLineage?.sourceConfigSnapshot.split(";")[0] ??
			"sha256:0000000000000000000000000000000000000000000000000000000000000000",
		rollbackPreimageSha256:
			input.rollbackPreimageSha256 ?? input.evidence.rollbackDrill?.preimageSha256,
		postRollbackVerificationSha256:
			input.postRollbackVerificationSha256 ??
			input.evidence.rollbackDrill?.postRollbackVerificationSha256,
		now: input.now,
	});
}

describe("direct-refresh discovery prewrite foundation", () => {
	it("keeps the schema constraints required before discovery writes", async () => {
		const schema = await readFile("prisma/schema.prisma", "utf8");

		assert.match(schema, /model Product \{[\s\S]*?\bean\s+String\s+@id/);
		assert.match(
			schema,
			/model SupermarketProduct \{[\s\S]*?@@unique\(\[product_ean,\s*supermarket_id\]\)/,
		);
		assert.match(
			schema,
			/model PriceHistory \{[\s\S]*?@@index\(\[supermarket_product_id,\s*scraped_at\]\)/,
		);
		assert.match(
			schema,
			/model StagingProduct \{[\s\S]*?@@index\(\[ean,\s*source_slug\]\)/,
		);
		assert.match(
			schema,
			/model DirectRefreshRunLedger \{[\s\S]*?\brun_key\s+String\s+@unique/,
		);
		assert.match(
			schema,
			/model DirectRefreshRunLedger \{[\s\S]*?@@unique\(\[source_slug,\s*attempt_id\]\)/,
		);
	});

	it("adds a source-scoped non-null SKU uniqueness guard for discovery creates", async () => {
		const migration = await readFile(
			"prisma/migrations/20260606_discovery_prewrite_foundation/migration.sql",
			"utf8",
		);

		assert.match(
			migration,
			/CREATE\s+UNIQUE\s+INDEX\s+"supermarket_products_source_sku_unique_nonnull"/i,
		);
		assert.match(migration, /ON\s+"supermarket_products"\s*\("supermarket_id",\s*"sku_id"\)/i);
		assert.match(migration, /WHERE\s+"sku_id"\s+IS\s+NOT\s+NULL/i);
		assert.doesNotMatch(migration, /DELETE\s+FROM\s+"supermarket_products"/i);
	});

	it("passes only when all Phase 1 pre-write foundation evidence is present", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			evidencePath: completeEvidence.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /no discovery apply/);
		assert.equal(report.summary.passCount, report.checks.length);
		assert.deepEqual(report.summary.failClosedReasons, []);
	});

	it("calculates artifact sha256 canonically without self-referential artifactSha256", () => {
		const withDifferentSelfHash = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactSha256:
					"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			},
		};

		assert.equal(
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				completeEvidence,
			),
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				withDifferentSelfHash,
			),
		);
	});

	it("calculates artifact sha256 independently of object key insertion order", () => {
		const reorderedEvidence = {
			performanceGuard: completeEvidence.performanceGuard,
			alertChannel: completeEvidence.alertChannel,
			compliance: completeEvidence.compliance,
			vtexBudgets: completeEvidence.vtexBudgets,
			rollbackDrill: completeEvidence.rollbackDrill,
			artifactLineage: completeEvidence.artifactLineage,
			controlPlane: completeEvidence.controlPlane,
			schemaConstraints: completeEvidence.schemaConstraints,
			generatedAt: completeEvidence.generatedAt,
		} as DirectRefreshDiscoveryPrewriteFoundationEvidence;

		assert.equal(
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				completeEvidence,
			),
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				reorderedEvidence,
			),
		);
	});

	it("fails closed when artifact path lineage does not match the evidence path", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			evidencePath:
				"audit/direct-refresh-discovery-prewrite-foundation/other-foundation-evidence.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must match evidence path/,
		);
	});

	it("fails closed when artifact path does not include attempt lineage", () => {
		const evidenceWithUnboundAttemptPath = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/foundation-evidence.json",
			},
		};
		evidenceWithUnboundAttemptPath.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithUnboundAttemptPath,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithUnboundAttemptPath,
			evidencePath: evidenceWithUnboundAttemptPath.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must include attempt ID/,
		);
	});

	it("fails closed when artifact path does not include source and count lineage", () => {
		const evidenceWithUnboundSourceCountPath = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/foundation-attempt-001/foundation-evidence.json",
			},
		};
		evidenceWithUnboundSourceCountPath.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithUnboundSourceCountPath,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithUnboundSourceCountPath,
			evidencePath: evidenceWithUnboundSourceCountPath.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must include source and count/,
		);
	});

	it("fails closed when artifact path does not include issue lineage", () => {
		const evidenceWithUnboundIssuePath = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/vea/count1/foundation-attempt-001/foundation-evidence.json",
			},
		};
		evidenceWithUnboundIssuePath.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithUnboundIssuePath,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithUnboundIssuePath,
			evidencePath: evidenceWithUnboundIssuePath.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must include issue/,
		);
	});

	it("fails closed when artifact path filename is not canonical", () => {
		const evidenceWithWrongArtifactFilename = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/issue-185/vea/count1/foundation-attempt-001/other.json",
			},
		};
		evidenceWithWrongArtifactFilename.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWrongArtifactFilename,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithWrongArtifactFilename,
			evidencePath: evidenceWithWrongArtifactFilename.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must be foundation audit json/,
		);
	});

	it("fails closed when artifact path lineage segments are out of canonical order", () => {
		const evidenceWithWrongArtifactPathOrder = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/vea/issue-185/count1/foundation-attempt-001/foundation-evidence.json",
			},
		};
		evidenceWithWrongArtifactPathOrder.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWrongArtifactPathOrder,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithWrongArtifactPathOrder,
			evidencePath: evidenceWithWrongArtifactPathOrder.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact path lineage must follow issue\/source\/count\/attempt order/,
		);
	});

	it("fails closed when artifact sha256 lineage does not match the evidence file hash", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			evidencePath: completeEvidence.artifactLineage.artifactPath,
			evidenceSha256:
				"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/artifact sha256 lineage must match evidence file hash/,
		);
	});

	it("fails closed when Phase 1 foundation evidence is stale", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				generatedAt: "2026-06-06T11:44:59.000Z",
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:00:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/foundation evidence must be fresh within 15 minutes/,
		);
	});

	it("reports missing foundation evidence timestamp without stale-noise duplication", () => {
		const { generatedAt: _generatedAt, ...evidenceWithoutTimestamp } =
			completeEvidence;
		const report = evaluateFoundation({
			evidence:
				evidenceWithoutTimestamp as DirectRefreshDiscoveryPrewriteFoundationEvidence,
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:00:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.deepEqual(report.checks[0].reasons, [
			"foundation evidence generatedAt is required",
		]);
	});

	it("fails closed instead of crashing when foundation evidence sections are malformed", () => {
		const report = evaluateFoundation({
			evidence: {
				generatedAt: "2026-06-06T12:25:00.000Z",
			} as DirectRefreshDiscoveryPrewriteFoundationEvidence,
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /Product\.ean primary key is required/);
		assert.match(reasons, /source lock is required/);
		assert.match(reasons, /artifact path lineage must be foundation audit json/);
		assert.match(reasons, /rollback drill must be executed before discovery apply/);
		assert.match(reasons, /VTEX request cap must be a positive integer/);
		assert.match(reasons, /compliance allowed-use review is required/);
		assert.match(
			reasons,
			/alert channel must include issue evidence comment and concrete alert destination/,
		);
		assert.match(
			reasons,
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit values/,
		);
	});

	it("fails closed when artifact lineage omits issue, source, count, attempt, path, or hash", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
					issue: 0,
					source: "",
					count: 0,
					attemptId: "",
					artifactPath: "",
					artifactSha256: "",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /issue lineage must be a positive integer/);
		assert.match(reasons, /source lineage must be writer-supported/);
		assert.match(reasons, /count lineage must be a positive integer/);
		assert.match(reasons, /attempt lineage must be a safe attempt ID/);
		assert.match(reasons, /artifact path lineage must be foundation audit json/);
		assert.match(reasons, /artifact sha256 lineage is required/);
	});

	it("fails closed when attempt lineage is not a safe attempt ID", () => {
		const evidenceWithUnsafeAttemptId = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				attemptId: " other attempt ",
			},
		};
		evidenceWithUnsafeAttemptId.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithUnsafeAttemptId,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithUnsafeAttemptId,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/attempt lineage must be a safe attempt ID/,
		);
	});

	it("fails closed when count lineage is fractional", () => {
		const evidenceWithFractionalCount = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				count: 1.5,
			},
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				rollbackIds: [
					"supermarket_products:901",
					"supermarket_products:902",
					"price_history:1001",
					"price_history:1002",
				],
			},
		};
		evidenceWithFractionalCount.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithFractionalCount,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithFractionalCount,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/count lineage must be a positive integer/,
		);
	});

	it("fails closed when issue lineage is fractional", () => {
		const evidenceWithFractionalIssue = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				issue: 185.5,
				artifactPath:
					"audit/direct-refresh-discovery-prewrite-foundation/issue-185.5/vea/count1/foundation-attempt-001/foundation-evidence.json",
			},
		};
		evidenceWithFractionalIssue.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithFractionalIssue,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithFractionalIssue,
			evidencePath: evidenceWithFractionalIssue.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/issue lineage must be a positive integer/,
		);
	});

	it("fails closed when source config snapshot or VTEX probe timestamp are malformed", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
					sourceConfigSnapshot: "config-hash-without-sha256",
					vtexProbeTimestamp: "not-a-timestamp",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /source config snapshot sha256 is required/);
		assert.match(reasons, /VTEX probe timestamp must be ISO datetime/);
	});

	it("fails closed when VTEX probe hash lineage is missing", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
					vtexProbeHash: "",
				},
			},
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/VTEX probe hash lineage is required/,
		);
	});

	it("fails closed when VTEX probe source does not match lineage source", () => {
		const evidenceWithWrongProbeSource = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				vtexProbeSource: "carrefour",
			},
		};
		evidenceWithWrongProbeSource.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWrongProbeSource,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithWrongProbeSource,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/VTEX probe source must match lineage source/,
		);
	});

	it("fails closed when VTEX probe timestamp is stale or future-dated", () => {
		const staleEvidence = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				vtexProbeTimestamp: "2026-06-06T12:00:00.000Z",
			},
		};
		staleEvidence.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				staleEvidence,
			);
		const futureEvidence = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				vtexProbeTimestamp: "2026-06-06T12:31:00.000Z",
			},
		};
		futureEvidence.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				futureEvidence,
			);
		const staleReport = evaluateFoundation({
			evidence: staleEvidence,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});
		const futureReport = evaluateFoundation({
			evidence: futureEvidence,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(staleReport.status, "FAIL");
		assert.equal(futureReport.status, "FAIL");
		assert.match(
			staleReport.summary.failClosedReasons.join("\n"),
			/VTEX probe timestamp must be fresh within 15 minutes/,
		);
		assert.match(
			futureReport.summary.failClosedReasons.join("\n"),
			/VTEX probe timestamp must be fresh within 15 minutes/,
		);
	});

	it("fails closed when source config snapshot has no real files", () => {
		const evidenceWithNoSnapshotFiles = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				sourceConfigSnapshot:
					"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; files:,",
			},
		};
		evidenceWithNoSnapshotFiles.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithNoSnapshotFiles,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithNoSnapshotFiles,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/source config snapshot sha256 is required/,
		);
	});

	it("fails closed when source config snapshot hash does not match runtime files", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			sourceConfigSnapshotSha256:
				"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/source config snapshot sha256 must match runtime files/,
		);
	});

	it("rejects unsafe source config snapshot file paths before runtime reads", () => {
		assert.throws(
			() =>
				parseDirectRefreshDiscoverySourceConfigSnapshotFiles(
					"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; files:,",
				),
			/source config snapshot files must include at least one file/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoverySourceConfigSnapshotFiles(
					"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; files:../secrets.env",
				),
			/source config snapshot files must be workspace-relative safe paths/,
		);
		assert.throws(
			() =>
				parseDirectRefreshDiscoverySourceConfigSnapshotFiles(
					"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; files:C:/Users/picala/.env",
				),
			/source config snapshot files must be workspace-relative safe paths/,
		);
	});

	it("fails closed when evaluator receives unsafe source config snapshot paths", () => {
		const evidenceWithUnsafeSnapshotPath = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				sourceConfigSnapshot:
					"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa; files:../secrets.env",
			},
		};
		evidenceWithUnsafeSnapshotPath.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithUnsafeSnapshotPath,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithUnsafeSnapshotPath,
			sourceConfigSnapshotSha256:
				"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/source config snapshot files must be workspace-relative safe paths/,
		);
	});

	it("fails closed when commit, tool version, or schema version lineage are malformed", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
					gitCommit: "not-a-commit",
					toolVersion: "direct-refresh-discovery-create",
					schemaVersion: "v1",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /git commit lineage must be hex/);
		assert.match(reasons, /tool version lineage must include positive @version/);
		assert.match(reasons, /schema version lineage must be numeric/);
	});

	it("fails closed when tool version lineage is zero", () => {
		const evidenceWithZeroToolVersion = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				toolVersion: "direct-refresh-discovery-create@0",
			},
		};
		evidenceWithZeroToolVersion.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithZeroToolVersion,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithZeroToolVersion,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/tool version lineage must include positive @version/,
		);
	});

	it("fails closed when source, artifact path, or DB environment lineage are invalid", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
					source: "dia",
					artifactPath: "../foundation.json",
					dbEnvironmentIdentity: "unknown",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /source lineage must be writer-supported/);
		assert.match(reasons, /artifact path lineage must be foundation audit json/);
		assert.match(reasons, /DB\/environment identity must be explicit/);
	});

	it("fails closed when rollback proof is read-only instead of executed", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					executed: false,
					mode: "read-only-review",
				},
			},
			evidencePath: "foundation.json",
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/rollback drill must be executed before discovery apply/,
		);
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/read-only rollback review is preparatory only/,
		);
	});

	it("fails closed when control-plane owner is generic", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				controlPlane: {
					...completeEvidence.controlPlane,
					owner: "Direct-refresh operator",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /control-plane owner must be explicit and non-placeholder/);
	});

	it("fails closed when rollback DR proof omits preimage, PITR, or cache handling", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					preimageCaptured: false,
					pitrBackupPosture: "",
					cacheHandling: "",
				},
			},
			evidencePath: "foundation.json",
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /rollback preimage capture is required/);
		assert.match(
			reasons,
			/PITR\/backup posture must include PITR or backup and reviewed or available/,
		);
		assert.match(reasons, /rollback cache handling is required/);
	});

	it("fails closed when PITR/backup posture evidence is vague", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					pitrBackupPosture: "looks ok",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/PITR\/backup posture must include PITR or backup and reviewed or available/,
		);
	});

	it("fails closed when preimage artifact evidence is missing or malformed", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					preimageArtifact: "../preimage.json",
					preimageSha256: "not-a-sha",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/preimage artifact must be rollback verification audit json/,
		);
		assert.match(reasons, /preimage sha256 is required/);
	});

	it("fails closed when post-rollback verification artifact evidence is missing or malformed", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					postRollbackVerificationArtifact: "../rollback.json",
					postRollbackVerificationSha256: "not-a-sha",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/post-rollback verification artifact must be rollback verification audit json/,
		);
		assert.match(reasons, /post-rollback verification sha256 is required/);
	});

	it("fails closed when rollback artifact filenames are not canonical", () => {
		const evidenceWithWrongRollbackArtifactFilenames = {
			...completeEvidence,
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				preimageArtifact:
					"audit/direct-refresh-discovery-rollback-verification/other-preimage.json",
				postRollbackVerificationArtifact:
					"audit/direct-refresh-discovery-rollback-verification/other-post-rollback.json",
			},
		};
		evidenceWithWrongRollbackArtifactFilenames.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWrongRollbackArtifactFilenames,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithWrongRollbackArtifactFilenames,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/preimage artifact must be rollback verification audit json/,
		);
		assert.match(
			reasons,
			/post-rollback verification artifact must be rollback verification audit json/,
		);
	});

	it("fails closed when rollback artifact roles are swapped", () => {
		const evidenceWithSwappedRollbackArtifacts = {
			...completeEvidence,
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				preimageArtifact:
					"audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json",
				postRollbackVerificationArtifact:
					"audit/direct-refresh-discovery-rollback-verification/preimage.json",
			},
		};
		evidenceWithSwappedRollbackArtifacts.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithSwappedRollbackArtifacts,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithSwappedRollbackArtifacts,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/preimage artifact must be rollback verification audit json/,
		);
		assert.match(
			reasons,
			/post-rollback verification artifact must be rollback verification audit json/,
		);
	});

	it("fails closed when rollback artifact hashes do not match runtime files", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			rollbackPreimageSha256:
				"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
			postRollbackVerificationSha256:
				"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/preimage sha256 must match runtime preimage artifact/,
		);
		assert.match(
			reasons,
			/post-rollback verification sha256 must match runtime artifact/,
		);
	});

	it("fails closed when rollback IDs are broad selectors instead of exact table IDs", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					rollbackIds: ["ean:7791234567890", "price_history:*"],
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /rollback IDs must be exact table:id entries/);
	});

	it("fails closed when rollback IDs omit source row or price history coverage", () => {
		const evidenceWithPartialRollbackIds = {
			...completeEvidence,
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				rollbackIds: ["price_history:1001"],
			},
		};
		evidenceWithPartialRollbackIds.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithPartialRollbackIds,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithPartialRollbackIds,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/rollback IDs must include supermarket_products and price_history entries/,
		);
	});

	it("fails closed when rollback ID coverage is lower than count lineage", () => {
		const evidenceWithInsufficientRollbackCount = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				count: 2,
			},
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				rollbackIds: [
					"supermarket_products:901",
					"price_history:1001",
				],
			},
		};
		evidenceWithInsufficientRollbackCount.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithInsufficientRollbackCount,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithInsufficientRollbackCount,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/rollback ID coverage must be at least count lineage per affected table/,
		);
	});

	it("fails closed when alert channel or owner are placeholders", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				alertChannel: {
					...completeEvidence.alertChannel,
					channel: "alert placeholder",
					owner: "Direct-refresh operator",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/alert channel must include issue evidence comment and concrete alert destination/,
		);
		assert.match(reasons, /alert owner must be explicit and non-placeholder/);
	});

	it("fails closed when owners contain placeholder text", () => {
		const evidenceWithEmbeddedPlaceholderOwners = {
			...completeEvidence,
			controlPlane: {
				...completeEvidence.controlPlane,
				owner: "placeholder-oncall",
			},
			alertChannel: {
				...completeEvidence.alertChannel,
				owner: "direct-refresh-placeholder-oncall",
			},
		};
		evidenceWithEmbeddedPlaceholderOwners.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithEmbeddedPlaceholderOwners,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithEmbeddedPlaceholderOwners,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/control-plane owner must be explicit and non-placeholder/,
		);
		assert.match(reasons, /alert owner must be explicit and non-placeholder/);
	});

	it("fails closed when alert policy omits severity, SLA, escalation, suppression, retry, or test proof", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				alertChannel: {
					...completeEvidence.alertChannel,
					severity: "high",
					ackSla: "",
					resolutionSla: "",
					escalationPath: "ask someone",
					suppressionPolicy: "quiet",
					retryPolicy: "retry",
					testAlertProof: "",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /alert severity must include write, postwrite, and rollback-required/);
		assert.match(reasons, /alert ack SLA is required/);
		assert.match(reasons, /alert resolution SLA is required/);
		assert.match(reasons, /alert escalation path must be explicit/);
		assert.match(reasons, /alert suppression policy must describe suppression\/noise handling/);
		assert.match(reasons, /alert retry policy must be explicit/);
		assert.match(reasons, /test-alert proof is required/);
	});

	it("fails closed when test-alert proof is not tied to an issue evidence comment", () => {
		const evidenceWithGenericTestAlertProof = {
			...completeEvidence,
			alertChannel: {
				...completeEvidence.alertChannel,
				testAlertProof: "test-alert proof captured",
			},
		};
		evidenceWithGenericTestAlertProof.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericTestAlertProof,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericTestAlertProof,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/test-alert proof is required/,
		);
	});

	it("fails closed when performance, VTEX budget, or compliance gates are incomplete", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				vtexBudgets: { ...completeEvidence.vtexBudgets, requestCap: 0 },
				compliance: { ...completeEvidence.compliance, allowedUseReviewed: false },
				performanceGuard: {
					...completeEvidence.performanceGuard,
					publicApiBaseline: "",
				},
			},
			evidencePath: "foundation.json",
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /VTEX request cap must be a positive integer/);
		assert.match(reasons, /compliance allowed-use review is required/);
		assert.match(reasons, /public API baseline must include search and products/);
	});

	it("fails closed when compliance does not cover the lineage source", () => {
		const evidenceWithWrongComplianceSource = {
			...completeEvidence,
			compliance: {
				...completeEvidence.compliance,
				reviewedSources: ["carrefour"],
			},
		};
		evidenceWithWrongComplianceSource.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWrongComplianceSource,
			);
		const report = evaluateFoundation({
			evidence: evidenceWithWrongComplianceSource,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/compliance reviewed sources must include lineage source/,
		);
	});

	it("fails closed when VTEX budgets are not tightly bounded", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				vtexBudgets: {
					...completeEvidence.vtexBudgets,
					requestCap: 10_000,
					concurrency: 10,
					timeoutMs: 60_000,
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /VTEX request cap must be <= 20/);
		assert.match(reasons, /VTEX concurrency must be serial/);
		assert.match(reasons, /VTEX timeout must be <= 10000ms/);
	});

	it("fails closed when VTEX request cap, concurrency, or timeout are fractional", () => {
		const evidenceWithFractionalBudgets = {
			...completeEvidence,
			vtexBudgets: {
				...completeEvidence.vtexBudgets,
				requestCap: 1.5,
				concurrency: 1.5,
				timeoutMs: 999.5,
			},
		};
		evidenceWithFractionalBudgets.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithFractionalBudgets,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithFractionalBudgets,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /VTEX request cap must be a positive integer/);
		assert.match(reasons, /VTEX concurrency must be a positive integer/);
		assert.match(reasons, /VTEX timeout must be a positive integer in milliseconds/);
	});

	it("fails closed when count lineage exceeds the VTEX request cap", () => {
		const evidenceWithCountAboveBudget = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
				count: 25,
			},
			vtexBudgets: {
				...completeEvidence.vtexBudgets,
				requestCap: 20,
			},
		};
		evidenceWithCountAboveBudget.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithCountAboveBudget,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithCountAboveBudget,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/count lineage must not exceed VTEX request cap/,
		);
	});

	it("fails closed when VTEX safety policies are too vague", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				vtexBudgets: {
					...completeEvidence.vtexBudgets,
					backoffPolicy: "retry later",
					stopRule: "stop if bad",
					headerPolicy: "custom headers",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /VTEX backoff policy must include timeout, 403, 429, HTML, and captcha/);
		assert.match(reasons, /VTEX stop rule must stop source on blocked, rate-limit, hash_invalid, and no automatic retry/);
		assert.match(reasons, /VTEX header policy must be documented and non-evasive/);
	});

	it("fails closed when performance guard evidence is too vague", () => {
		const report = evaluateFoundation({
			evidence: {
				...completeEvidence,
				performanceGuard: {
					prismaPoolPosture: "ok",
					transactionTimeoutPosture: "ok",
					priceHistoryBaseline: "ok",
					publicApiBaseline: "ok",
					cacheTtlBaseline: "ok",
				},
			},
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(
			reasons,
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit values/,
		);
		assert.match(
			reasons,
			/transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout/,
		);
		assert.match(reasons, /PriceHistory baseline must include insert and read/);
		assert.match(reasons, /public API baseline must include search and products/);
		assert.match(reasons, /cache TTL baseline must include TTL/);
	});

	it("fails closed when Prisma pool posture lists required terms without values", () => {
		const evidenceWithGenericPrismaPoolPosture = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			performanceGuard: {
				...completeEvidence.performanceGuard,
				prismaPoolPosture: "pgbouncer connection_limit pool_timeout",
			},
		};
		evidenceWithGenericPrismaPoolPosture.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericPrismaPoolPosture,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericPrismaPoolPosture,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit values/,
		);
	});

	it("fails closed when PriceHistory insert/read evidence omits baseline", () => {
		const evidenceWithGenericPriceHistoryBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				priceHistoryBaseline: "PriceHistory insert/read",
			},
		};
		evidenceWithGenericPriceHistoryBaseline.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericPriceHistoryBaseline,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericPriceHistoryBaseline,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/PriceHistory baseline must include insert and read/,
		);
	});

	it("fails closed when cache TTL baseline evidence is generic", () => {
		const evidenceWithGenericCacheTtlBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				cacheTtlBaseline: "TTL",
			},
		};
		evidenceWithGenericCacheTtlBaseline.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericCacheTtlBaseline,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericCacheTtlBaseline,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/cache TTL baseline must include TTL/,
		);
	});

	it("fails closed when public API baseline evidence is generic", () => {
		const evidenceWithGenericPublicApiBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				publicApiBaseline: "search products",
			},
		};
		evidenceWithGenericPublicApiBaseline.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericPublicApiBaseline,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericPublicApiBaseline,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/public API baseline must include search and products/,
		);
	});

	it("parses a read-only CLI boundary and rejects write-like flags", () => {
		const options = parseDirectRefreshDiscoveryPrewriteFoundationCliOptions([
			"tsx",
			"script",
			"--evidence=foundation.json",
			"--output=report.json",
		]);

		assert.equal(options.evidence, "foundation.json");
		assert.equal(options.output, "report.json");
		assert.throws(
			() =>
				parseDirectRefreshDiscoveryPrewriteFoundationCliOptions([
					"tsx",
					"script",
					"--evidence=foundation.json",
					"--apply=true",
				]),
			/rejects --apply/,
		);
	});

	it("parses evidence JSON with an optional UTF-8 BOM", () => {
		const parsed = parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson(
			`\uFEFF${JSON.stringify(completeEvidence)}`,
		);

		assert.equal(parsed.schemaConstraints.migrationStatus, "PASS");
		assert.equal(parsed.rollbackDrill.mode, "controlled-disposable-row");
	});

	it("keeps a versioned Phase 1 policy artifact for static pre-write gates", async () => {
		const policy = parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson(
			await readFile(
				"docs/direct-refresh-discovery-prewrite-foundation-policy.json",
				"utf8",
			),
		);
		const report = evaluateFoundation({
			evidence: policy,
			evidencePath: "docs/direct-refresh-discovery-prewrite-foundation-policy.json",
		});
		const reasons = report.summary.failClosedReasons.join("\n");

		assert.equal(policy.controlPlane.ttlPolicy, true);
		assert.equal(policy.controlPlane.idempotencyPolicy, true);
		assert.match(policy.artifactLineage.sourceConfigSnapshot, /^sha256:[a-f0-9]{64}; files:/);
		assert.equal(typeof policy.artifactLineage.vtexProbeHash, "string");
		assert.equal(policy.vtexBudgets.concurrency, 1);
		assert.equal(policy.alertChannel.rollbackRequired, true);
		assert.doesNotMatch(reasons, /TTL policy is required/);
		assert.doesNotMatch(reasons, /idempotency policy is required/);
		assert.doesNotMatch(reasons, /source config snapshot is required/);
		assert.doesNotMatch(reasons, /VTEX request cap must be positive/);
		assert.doesNotMatch(reasons, /alert channel is required/);
		assert.match(reasons, /rollback drill must be executed/);
		assert.match(reasons, /migration status must be PASS/);
		assert.match(reasons, /public API baseline must include search and products/);
	});
});
