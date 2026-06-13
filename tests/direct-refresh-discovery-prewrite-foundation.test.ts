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
		verifiedAt: "2026-06-06T12:20:00.000Z",
		productEanPrimaryKey: true,
		productSourceUnique: true,
		sourceSkuUniqueNonnull: true,
		priceHistoryIndex: true,
		stagingProductIndex: true,
		ledgerUniqueness: true,
		migrationStatus: "PASS",
		migrationEvidence: {
			scope: "direct-refresh-discovery-prewrite-foundation",
			verificationMode: "read-only-source-controlled-review",
			migrationPaths: [
				"prisma/migrations/20260606_discovery_prewrite_foundation/migration.sql",
			],
			noMigrationExecution: true,
			issue: 235,
		},
	},
	controlPlane: {
		verifiedAt: "2026-06-06T12:20:00.000Z",
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
		pitrBackupPosture:
			"Supabase PITR/backup posture reviewed for env=local-test-db; retention=7d; artifact=audit/direct-refresh-discovery-rollback-verification/preimage.json; timestamp=2026-06-06T12:20:00.000Z",
		cacheHandling:
			"No cache purge needed for disposable-row drill; public cache TTL reviewed; post-rollback cache verification artifact=audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json; timestamp=2026-06-06T12:20:00.000Z",
	},
	vtexBudgets: {
		verifiedAt: "2026-06-06T12:20:00.000Z",
		requestCap: 20,
		concurrency: 1,
		timeoutMs: 10_000,
		backoffPolicy: "backoff on timeout/403/429/HTML/captcha",
		stopRule: "source STOPPED on blocked/rate-limit/hash_invalid; no automatic retry",
		headerPolicy: "documented non-evasive headers",
	},
	compliance: {
		reviewedAt: "2026-06-06T12:20:00.000Z",
		allowedUseReviewed: true,
		posture: "approved",
		reviewedSources: ["vea"],
	},
	alertChannel: {
		policyVerifiedAt: "2026-06-06T12:20:00.000Z",
		channel: "Issue #109 comment + #direct-refresh-alerts",
		owner: "direct-refresh-oncall",
		severity: "critical write/postwrite/rollback-required",
		ackSla: "ack SLA <= 30m",
		resolutionSla: "resolution SLA <= 4h",
		escalationPath: "escalate to direct-refresh-oncall then data-platform-oncall",
		suppressionPolicy: "suppression/noise policy: no suppression for rollback-required",
		retryPolicy: "retry policy: no automatic retry after rollback-required",
		testAlertProof:
			"test-alert proof captured in issue #231 evidence comment comment-id=231001 for scenarios write-failure, postwrite-failure, rollback-required timestamp=2026-06-06T12:20:00.000Z",
		writeFailure: true,
		postwriteFailure: true,
		rollbackRequired: true,
	},
	performanceGuard: {
		prismaPoolPosture:
			"pgbouncer=true; connection_limit=3; pool_timeout=10; verifiedAt=2026-06-06T12:20:00.000Z",
		transactionTimeoutPosture:
			"statement_timeout=2min; idle_in_transaction_session_timeout=30s; verifiedAt=2026-06-06T12:20:00.000Z",
		priceHistoryBaseline:
			"PriceHistory insert/read baseline captured; insert_p95=50ms; read_p95=30ms; measuredAt=2026-06-06T12:20:00.000Z",
		publicApiBaseline:
			"public API search/products baseline captured; p95=120ms; measuredAt=2026-06-06T12:20:00.000Z",
		cacheTtlBaseline:
			"cache TTL baseline captured; ttl=300s; measuredAt=2026-06-06T12:20:00.000Z",
	},
};

completeEvidence.artifactLineage.artifactSha256 =
	calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
		completeEvidence,
	);

function withCalculatedFoundationSha(
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence,
) {
	evidence.artifactLineage.artifactSha256 =
		calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(evidence);
	return evidence;
}

function evaluateFoundation(input: {
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence;
	evidencePath?: string;
	evidenceSha256?: string;
	sourceConfigSnapshotSha256?: string;
	rollbackPreimageSha256?: string;
	rollbackPreimageGeneratedAt?: string;
	postRollbackVerificationSha256?: string;
	postRollbackVerificationGeneratedAt?: string;
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
		rollbackPreimageGeneratedAt:
			"rollbackPreimageGeneratedAt" in input
				? input.rollbackPreimageGeneratedAt
				: input.evidence.generatedAt,
		postRollbackVerificationSha256:
			input.postRollbackVerificationSha256 ??
			input.evidence.rollbackDrill?.postRollbackVerificationSha256,
		postRollbackVerificationGeneratedAt:
			"postRollbackVerificationGeneratedAt" in input
				? input.postRollbackVerificationGeneratedAt
				: input.evidence.generatedAt,
		now: input.now,
	} as Parameters<typeof evaluateDirectRefreshDiscoveryPrewriteFoundation>[0] & {
		rollbackPreimageGeneratedAt?: string;
		postRollbackVerificationGeneratedAt?: string;
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

	it("requires bounded read-only migration evidence before accepting migration PASS", () => {
		const evidence = withCalculatedFoundationSha({
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			schemaConstraints: {
				...completeEvidence.schemaConstraints,
				migrationEvidence: undefined,
			},
		});
		const report = evaluateFoundation({
			evidence,
			evidencePath: evidence.artifactLineage.artifactPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/migration evidence must prove bounded direct-refresh prewrite scope without migration execution/,
		);
	});

	it("fails closed for malformed bounded migration evidence", () => {
		const approvedMigrationEvidence =
			completeEvidence.schemaConstraints.migrationEvidence;
		assert.ok(approvedMigrationEvidence);

		const malformedEvidenceCases: Array<{
			name: string;
			migrationEvidence: unknown;
		}> = [
			{
				name: "wrong scope",
				migrationEvidence: {
					...approvedMigrationEvidence,
					scope: "direct-refresh-discovery-postwrite-foundation",
				},
			},
			{
				name: "wrong verification mode",
				migrationEvidence: {
					...approvedMigrationEvidence,
					verificationMode: "migration-executed",
				},
			},
			{
				name: "missing migration path",
				migrationEvidence: {
					...approvedMigrationEvidence,
					migrationPaths: [],
				},
			},
			{
				name: "extra migration path",
				migrationEvidence: {
					...approvedMigrationEvidence,
					migrationPaths: [
						...approvedMigrationEvidence.migrationPaths,
						"src/lib/supermarkets.ts",
					],
				},
			},
			{
				name: "migration execution allowed",
				migrationEvidence: {
					...approvedMigrationEvidence,
					noMigrationExecution: false,
				},
			},
			{
				name: "wrong issue",
				migrationEvidence: {
					...approvedMigrationEvidence,
					issue: 234,
				},
			},
			{
				name: "non-numeric issue",
				migrationEvidence: {
					...approvedMigrationEvidence,
					issue: "235",
				},
			},
		];

		for (const { name, migrationEvidence } of malformedEvidenceCases) {
			const evidence = withCalculatedFoundationSha({
				...completeEvidence,
				artifactLineage: { ...completeEvidence.artifactLineage },
				schemaConstraints: {
					...completeEvidence.schemaConstraints,
					migrationEvidence:
						migrationEvidence as DirectRefreshDiscoveryPrewriteFoundationEvidence["schemaConstraints"]["migrationEvidence"],
				},
			});
			const report = evaluateFoundation({
				evidence,
				evidencePath: evidence.artifactLineage.artifactPath,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", name);
			assert.match(
				report.summary.failClosedReasons.join("\n"),
				/migration evidence must prove bounded direct-refresh prewrite scope without migration execution/,
				name,
			);
		}
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

	it("fails closed when group-level freshness timestamps are missing", () => {
		const cases = [
			{
				group: "schemaConstraints",
				field: "verifiedAt",
				reason: "schema constraints verifiedAt is required",
			},
			{
				group: "controlPlane",
				field: "verifiedAt",
				reason: "control-plane verifiedAt is required",
			},
			{
				group: "vtexBudgets",
				field: "verifiedAt",
				reason: "VTEX budgets verifiedAt is required",
			},
			{
				group: "compliance",
				field: "reviewedAt",
				reason: "compliance reviewedAt is required",
			},
			{
				group: "alertChannel",
				field: "policyVerifiedAt",
				reason: "alert policy verifiedAt is required",
			},
		] as const;

		for (const { group, field, reason } of cases) {
			const evidence = structuredClone(completeEvidence) as Record<string, Record<string, unknown>>;
			delete evidence[group][field];

			const report = evaluateFoundation({
				evidence: withCalculatedFoundationSha(
					evidence as DirectRefreshDiscoveryPrewriteFoundationEvidence,
				),
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", `${group}.${field}`);
			assert.match(report.summary.failClosedReasons.join("\n"), new RegExp(reason));
		}
	});

	it("fails closed when group-level freshness timestamps are malformed, stale, or future-dated", () => {
		const groups = [
			{
				group: "schemaConstraints",
				field: "verifiedAt",
				malformedReason: "schema constraints verifiedAt must be ISO datetime",
				freshReason: "schema constraints verifiedAt must be fresh within 15 minutes",
			},
			{
				group: "controlPlane",
				field: "verifiedAt",
				malformedReason: "control-plane verifiedAt must be ISO datetime",
				freshReason: "control-plane verifiedAt must be fresh within 15 minutes",
			},
			{
				group: "vtexBudgets",
				field: "verifiedAt",
				malformedReason: "VTEX budgets verifiedAt must be ISO datetime",
				freshReason: "VTEX budgets verifiedAt must be fresh within 15 minutes",
			},
			{
				group: "compliance",
				field: "reviewedAt",
				malformedReason: "compliance reviewedAt must be ISO datetime",
				freshReason: "compliance reviewedAt must be fresh within 15 minutes",
			},
			{
				group: "alertChannel",
				field: "policyVerifiedAt",
				malformedReason: "alert policy verifiedAt must be ISO datetime",
				freshReason: "alert policy verifiedAt must be fresh within 15 minutes",
			},
		] as const;
		const timestampCases = [
			{ value: "not-a-date", reasonKey: "malformedReason" },
			{ value: "2026-06-06T12:00:00.000Z", reasonKey: "freshReason" },
			{ value: "2026-06-06T12:31:00.000Z", reasonKey: "freshReason" },
		] as const;

		for (const { group, field, ...reasons } of groups) {
			for (const { value, reasonKey } of timestampCases) {
				const evidence = structuredClone(completeEvidence) as Record<string, Record<string, unknown>>;
				evidence[group][field] = value;

				const report = evaluateFoundation({
					evidence: withCalculatedFoundationSha(
						evidence as DirectRefreshDiscoveryPrewriteFoundationEvidence,
					),
					now: new Date("2026-06-06T12:30:00.000Z"),
				});

				assert.equal(report.status, "FAIL", `${group}.${field} ${value}`);
				assert.match(
					report.summary.failClosedReasons.join("\n"),
					new RegExp(reasons[reasonKey]),
					`${group}.${field} ${value}`,
				);
			}
		}
	});

	it("keeps alert policy freshness separate from test-alert proof freshness", () => {
		const evidence = structuredClone(completeEvidence) as Record<string, Record<string, unknown>>;
		delete evidence.alertChannel.policyVerifiedAt;

		const report = evaluateFoundation({
			evidence: withCalculatedFoundationSha(
				evidence as DirectRefreshDiscoveryPrewriteFoundationEvidence,
			),
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /alert policy verifiedAt is required/);
		assert.doesNotMatch(reasons, /test-alert proof timestamp is required/);
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
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit positive values/,
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
			/PITR\/backup posture requires reviewed availability plus environment\/timestamp\/retention\/artifact detail/,
		);
		assert.match(
			reasons,
			/rollback cache handling requires cache plus TTL\/invalidation\/no-purge\/post-rollback cache proof/,
		);
	});

	it("fails closed when PITR/backup posture timestamp is missing, malformed, stale, or future-dated", () => {
		const cases = [
			{
				posture:
					"Supabase PITR/backup posture reviewed for env=local-test-db; retention=7d; artifact=audit/direct-refresh-discovery-rollback-verification/preimage.json",
				reason: "PITR/backup posture timestamp is required",
			},
			{
				posture:
					"Supabase PITR/backup posture reviewed for env=local-test-db; retention=7d; artifact=audit/direct-refresh-discovery-rollback-verification/preimage.json; timestamp=not-a-date",
				reason: "PITR/backup posture timestamp must be ISO datetime",
			},
			{
				posture:
					"Supabase PITR/backup posture reviewed for env=local-test-db; retention=7d; artifact=audit/direct-refresh-discovery-rollback-verification/preimage.json; verifiedAt=2026-06-06T12:00:00.000Z",
				reason:
					"PITR/backup posture timestamp must be fresh within 15 minutes",
			},
			{
				posture:
					"Supabase PITR/backup posture reviewed for env=local-test-db; retention=7d; artifact=audit/direct-refresh-discovery-rollback-verification/preimage.json; timestamp=2026-06-06T12:31:00.000Z",
				reason:
					"PITR/backup posture timestamp must be fresh within 15 minutes",
			},
		];

		for (const { posture, reason } of cases) {
			const report = evaluateFoundation({
				evidence: withCalculatedFoundationSha({
					...completeEvidence,
					artifactLineage: { ...completeEvidence.artifactLineage },
					rollbackDrill: {
						...completeEvidence.rollbackDrill,
						pitrBackupPosture: posture,
					},
				}),
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", posture);
			assert.match(report.summary.failClosedReasons.join("\n"), new RegExp(reason));
		}
	});

	it("fails closed when rollback cache handling timestamp is missing, malformed, stale, or future-dated", () => {
		const cases = [
			{
				cacheHandling:
					"No cache purge needed for disposable-row drill; public cache TTL reviewed; post-rollback cache verification artifact=audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json",
				reason: "rollback cache handling timestamp is required",
			},
			{
				cacheHandling:
					"No cache purge needed for disposable-row drill; public cache TTL reviewed; post-rollback cache verification artifact=audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json; timestamp=not-a-date",
				reason: "rollback cache handling timestamp must be ISO datetime",
			},
			{
				cacheHandling:
					"No cache purge needed for disposable-row drill; public cache TTL reviewed; post-rollback cache verification artifact=audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json; verifiedAt=2026-06-06T12:00:00.000Z",
				reason:
					"rollback cache handling timestamp must be fresh within 15 minutes",
			},
			{
				cacheHandling:
					"No cache purge needed for disposable-row drill; public cache TTL reviewed; post-rollback cache verification artifact=audit/direct-refresh-discovery-rollback-verification/post-rollback-verification.json; timestamp=2026-06-06T12:31:00.000Z",
				reason:
					"rollback cache handling timestamp must be fresh within 15 minutes",
			},
		];

		for (const { cacheHandling, reason } of cases) {
			const report = evaluateFoundation({
				evidence: withCalculatedFoundationSha({
					...completeEvidence,
					artifactLineage: { ...completeEvidence.artifactLineage },
					rollbackDrill: {
						...completeEvidence.rollbackDrill,
						cacheHandling,
					},
				}),
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", cacheHandling);
			assert.match(report.summary.failClosedReasons.join("\n"), new RegExp(reason));
		}
	});

	it("fails closed when rollback cache handling proof is generic", () => {
		for (const cacheHandling of ["cache reviewed", "cache handled", "cache ok"]) {
			const evidenceWithGenericRollbackCacheHandling = {
				...completeEvidence,
				artifactLineage: {
					...completeEvidence.artifactLineage,
				},
				rollbackDrill: {
					...completeEvidence.rollbackDrill,
					cacheHandling,
				},
			};
			evidenceWithGenericRollbackCacheHandling.artifactLineage.artifactSha256 =
				calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
					evidenceWithGenericRollbackCacheHandling,
				);

			const report = evaluateFoundation({
				evidence: evidenceWithGenericRollbackCacheHandling,
				evidencePath: completeEvidence.artifactLineage.artifactPath,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			const reasons = report.summary.failClosedReasons.join("\n");
			assert.equal(report.status, "FAIL", cacheHandling);
			assert.match(
				reasons,
				/rollback cache handling requires cache plus TTL\/invalidation\/no-purge\/post-rollback cache proof/,
				cacheHandling,
			);
		}
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
			/PITR\/backup posture requires reviewed availability plus environment\/timestamp\/retention\/artifact detail/,
		);
	});

	it("fails closed when PITR/backup posture has only generic backup availability", () => {
		const evidenceWithGenericBackupAvailability = {
			...completeEvidence,
			artifactLineage: {
				...completeEvidence.artifactLineage,
			},
			rollbackDrill: {
				...completeEvidence.rollbackDrill,
				pitrBackupPosture: "backup available",
			},
		};
		evidenceWithGenericBackupAvailability.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericBackupAvailability,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericBackupAvailability,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/PITR\/backup posture requires reviewed availability plus environment\/timestamp\/retention\/artifact detail/,
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

	it("fails closed when alert channel has issue but no explicit comment", () => {
		const evidenceWithIssueOnlyChannel = {
			...completeEvidence,
			alertChannel: {
				...completeEvidence.alertChannel,
				channel: "Issue #109 + #direct-refresh-alerts",
			},
		};
		evidenceWithIssueOnlyChannel.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithIssueOnlyChannel,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithIssueOnlyChannel,
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(report.summary.failClosedReasons.join("\n"), /alert channel must include issue evidence comment and concrete alert destination/);
	});

	it("fails closed when alert channel has issue/comment text but no concrete reference", () => {
		const evidenceWithWeakChannel = {
			...completeEvidence,
			alertChannel: {
				...completeEvidence.alertChannel,
				channel: "Issue comment + #direct-refresh-alerts",
			},
		};
		evidenceWithWeakChannel.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithWeakChannel,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithWeakChannel,
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/alert channel must include issue evidence comment and concrete alert destination/,
		);
	});

	it("fails closed when runtime rollback artifacts omit generatedAt", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			rollbackPreimageGeneratedAt: undefined,
			postRollbackVerificationGeneratedAt: undefined,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /preimage artifact generatedAt is required/);
		assert.match(
			reasons,
			/post-rollback verification artifact generatedAt is required/,
		);
	});

	it("fails closed when runtime rollback artifact generatedAt values are malformed", () => {
		const report = evaluateFoundation({
			evidence: completeEvidence,
			rollbackPreimageGeneratedAt: "not-a-date",
			postRollbackVerificationGeneratedAt: "also-not-a-date",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /preimage artifact generatedAt must be ISO datetime/);
		assert.match(
			reasons,
			/post-rollback verification artifact generatedAt must be ISO datetime/,
		);
	});

	it("fails closed when runtime rollback artifact generatedAt values are stale or future-dated", () => {
		const cases = [
			{
				rollbackPreimageGeneratedAt: "2026-06-06T12:00:00.000Z",
				postRollbackVerificationGeneratedAt: "2026-06-06T12:25:00.000Z",
				reason: /preimage artifact generatedAt must be fresh within 15 minutes/,
			},
			{
				rollbackPreimageGeneratedAt: "2026-06-06T12:25:00.000Z",
				postRollbackVerificationGeneratedAt: "2026-06-06T12:31:00.000Z",
				reason:
					/post-rollback verification artifact generatedAt must be fresh within 15 minutes/,
			},
		];

		for (const testCase of cases) {
			const report = evaluateFoundation({
				evidence: completeEvidence,
				rollbackPreimageGeneratedAt: testCase.rollbackPreimageGeneratedAt,
				postRollbackVerificationGeneratedAt:
					testCase.postRollbackVerificationGeneratedAt,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL");
			assert.match(report.summary.failClosedReasons.join("\n"), testCase.reason);
		}
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
		assert.match(reasons, /alert ack SLA must include an explicit time bound/);
		assert.match(reasons, /alert resolution SLA must include an explicit time bound/);
		assert.match(reasons, /alert escalation path must include a concrete route/);
		assert.match(
			reasons,
			/alert suppression\/noise policy must protect rollback-required or write\/postwrite failures/,
		);
		assert.match(reasons, /alert retry policy must prohibit automatic retry or bind to rollback-required/);
		assert.match(reasons, /test-alert proof requires issue\/comment plus concrete reference/);
		assert.match(
			reasons,
			/test-alert proof must reference write-failure, postwrite-failure, and rollback-required scenarios/,
		);
	});

	it("fails closed when test-alert proof omits explicit alert scenarios", () => {
		const evidenceWithoutScenarioProof = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				testAlertProof:
					"test-alert proof captured in issue #231 evidence comment comment-id=231001 timestamp=2026-06-06T12:20:00.000Z",
			},
		};
		evidenceWithoutScenarioProof.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithoutScenarioProof,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithoutScenarioProof,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/test-alert proof must reference write-failure, postwrite-failure, and rollback-required scenarios/,
		);
	});

	it("fails closed when alert escalation path is generic instead of a concrete route", () => {
		const evidenceWithGenericEscalationPath = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				escalationPath: "escalate owner",
			},
		};
		evidenceWithGenericEscalationPath.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericEscalationPath,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericEscalationPath,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/alert escalation path must include a concrete route/,
		);
	});

	it("fails closed when alert SLA evidence omits explicit time bounds", () => {
		const evidenceWithGenericAlertSla = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				ackSla: "ack SLA",
				resolutionSla: "resolution SLA",
			},
		};
		evidenceWithGenericAlertSla.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericAlertSla,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericAlertSla,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		const reasons = report.summary.failClosedReasons.join("\n");
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /alert ack SLA must include an explicit time bound/);
		assert.match(reasons, /alert resolution SLA must include an explicit time bound/);
	});

	it("fails closed when alert suppression policy is generic noise handling", () => {
		const evidenceWithGenericSuppressionPolicy = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				suppressionPolicy: "suppression noise",
			},
		};
		evidenceWithGenericSuppressionPolicy.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericSuppressionPolicy,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericSuppressionPolicy,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/suppression\/noise policy must protect rollback-required or write\/postwrite failures/,
		);
	});

	it("fails closed when alert retry policy is generic manual retry", () => {
		const evidenceWithGenericRetryPolicy = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				retryPolicy: "retry policy manual",
			},
		};
		evidenceWithGenericRetryPolicy.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericRetryPolicy,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericRetryPolicy,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/retry policy must prohibit automatic retry or bind to rollback-required/,
		);
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
			/test-alert proof requires issue\/comment plus concrete reference/,
		);
	});

	it("fails closed when test-alert proof is nominal but has no concrete evidence reference", () => {
		const evidenceWithNominalTestAlertProof = {
			...completeEvidence,
			alertChannel: {
				...completeEvidence.alertChannel,
				testAlertProof: "test-alert proof captured in issue evidence comment",
			},
		};
		evidenceWithNominalTestAlertProof.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithNominalTestAlertProof,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithNominalTestAlertProof,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/test-alert proof requires issue\/comment plus concrete reference/,
		);
	});

	it("fails closed when test-alert proof omits a fresh explicit timestamp", () => {
		const evidenceWithoutTestAlertTimestamp = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			alertChannel: {
				...completeEvidence.alertChannel,
				testAlertProof:
					"test-alert proof captured in issue #109 evidence comment comment-id=987654",
			},
		};
		evidenceWithoutTestAlertTimestamp.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithoutTestAlertTimestamp,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithoutTestAlertTimestamp,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/test-alert proof timestamp is required/,
		);
	});

	it("fails closed when test-alert proof timestamp is malformed, stale, or future-dated", () => {
		const cases = [
			{
				proof:
					"test-alert proof captured in issue #109 evidence comment comment-id=987654 timestamp=not-a-date",
				reason: /test-alert proof timestamp must be ISO datetime/,
			},
			{
				proof:
					"test-alert proof captured in issue #109 evidence comment comment-id=987654 timestamp=2026-06-06T12:00:00.000Z",
				reason: /test-alert proof timestamp must be fresh within 15 minutes/,
			},
			{
				proof:
					"test-alert proof captured in issue #109 evidence comment comment-id=987654 testedAt=2026-06-06T12:31:00.000Z",
				reason: /test-alert proof timestamp must be fresh within 15 minutes/,
			},
		];

		for (const { proof, reason } of cases) {
			const evidenceWithInvalidTestAlertTimestamp = {
				...completeEvidence,
				artifactLineage: { ...completeEvidence.artifactLineage },
				alertChannel: {
					...completeEvidence.alertChannel,
					testAlertProof: proof,
				},
			};
			evidenceWithInvalidTestAlertTimestamp.artifactLineage.artifactSha256 =
				calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
					evidenceWithInvalidTestAlertTimestamp,
				);

			const report = evaluateFoundation({
				evidence: evidenceWithInvalidTestAlertTimestamp,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", proof);
			assert.match(report.summary.failClosedReasons.join("\n"), reason, proof);
		}
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
		assert.match(reasons, /public API baseline requires search\/products and an explicit performance metric/);
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

	it("fails closed when VTEX header policy is documented and non-evasive but omits headers and user-agent", () => {
		const evidenceWithGenericHeaderPolicy = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			vtexBudgets: {
				...completeEvidence.vtexBudgets,
				headerPolicy: "documented non-evasive",
			},
		};
		evidenceWithGenericHeaderPolicy.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericHeaderPolicy,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericHeaderPolicy,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/VTEX header policy must be documented, non-evasive, and include user-agent or headers/,
		);
	});

	it("fails closed when VTEX backoff policy lists errors but omits backoff", () => {
		const evidenceWithErrorListOnlyBackoffPolicy = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			vtexBudgets: {
				...completeEvidence.vtexBudgets,
				backoffPolicy: "timeout 403 429 HTML captcha",
			},
		};
		evidenceWithErrorListOnlyBackoffPolicy.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithErrorListOnlyBackoffPolicy,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithErrorListOnlyBackoffPolicy,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/VTEX backoff policy must include backoff plus timeout, 403, 429, HTML, and captcha/,
		);
	});

	it("fails closed when VTEX stop rule lists blockers without source STOPPED state", () => {
		const evidenceWithConditionListOnlyStopRule = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			vtexBudgets: {
				...completeEvidence.vtexBudgets,
				stopRule: "blocked rate-limit hash_invalid no automatic retry",
			},
		};
		evidenceWithConditionListOnlyStopRule.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithConditionListOnlyStopRule,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithConditionListOnlyStopRule,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/VTEX stop rule must set source STOPPED on blocked\/rate-limit\/hash_invalid and no automatic retry/,
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
		assert.match(reasons, /VTEX backoff policy must include backoff plus timeout, 403, 429, HTML, and captcha/);
		assert.match(reasons, /VTEX stop rule must set source STOPPED on blocked\/rate-limit\/hash_invalid and no automatic retry/);
		assert.match(reasons, /VTEX header policy must be documented, non-evasive, and include user-agent or headers/);
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
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit positive values/,
		);
		assert.match(
			reasons,
			/transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout/,
		);
		assert.match(reasons, /PriceHistory baseline requires insert\/read and an explicit metric/);
		assert.match(reasons, /public API baseline requires search\/products and an explicit performance metric/);
		assert.match(
			reasons,
			/cache TTL baseline requires TTL and an explicit temporal value/,
		);
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
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit positive values/,
		);
	});

	it("fails closed when Prisma pool posture uses non-positive pool values", () => {
		const evidenceWithNonPositivePrismaPoolPosture = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			performanceGuard: {
				...completeEvidence.performanceGuard,
				prismaPoolPosture:
					"pgbouncer=true; connection_limit=0; pool_timeout=0",
			},
		};
		evidenceWithNonPositivePrismaPoolPosture.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithNonPositivePrismaPoolPosture,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithNonPositivePrismaPoolPosture,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit positive values/,
		);
	});

	it("fails closed when Prisma pool posture disables pgbouncer", () => {
		const evidenceWithDisabledPgbouncer = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			performanceGuard: {
				...completeEvidence.performanceGuard,
				prismaPoolPosture:
					"pgbouncer=false; connection_limit=3; pool_timeout=10",
			},
		};
		evidenceWithDisabledPgbouncer.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithDisabledPgbouncer,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithDisabledPgbouncer,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/Prisma pool posture must include pgbouncer, connection_limit, pool_timeout, and explicit positive values/,
		);
	});

	it("fails closed when transaction timeout posture lists required terms without values", () => {
		const evidenceWithGenericTransactionTimeoutPosture = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			performanceGuard: {
				...completeEvidence.performanceGuard,
				transactionTimeoutPosture:
					"statement_timeout idle_in_transaction_session_timeout",
			},
		};
		evidenceWithGenericTransactionTimeoutPosture.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithGenericTransactionTimeoutPosture,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithGenericTransactionTimeoutPosture,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout with positive temporal values/,
		);
	});

	it("fails closed when transaction timeout posture disables idle transaction timeout", () => {
		const evidenceWithDisabledIdleTransactionTimeout = {
			...completeEvidence,
			artifactLineage: { ...completeEvidence.artifactLineage },
			performanceGuard: {
				...completeEvidence.performanceGuard,
				transactionTimeoutPosture:
					"statement_timeout=2min; idle_in_transaction_session_timeout=0",
			},
		};
		evidenceWithDisabledIdleTransactionTimeout.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithDisabledIdleTransactionTimeout,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithDisabledIdleTransactionTimeout,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout with positive temporal values/,
		);
	});

	it("fails closed when performance posture strings omit explicit fresh timestamps", () => {
		const cases = [
			{
				field: "prismaPoolPosture",
				value: "pgbouncer=true; connection_limit=3; pool_timeout=10",
				reason: /Prisma pool posture timestamp is required/,
			},
			{
				field: "transactionTimeoutPosture",
				value: "statement_timeout=2min; idle_in_transaction_session_timeout=30s",
				reason: /transaction timeout posture timestamp is required/,
			},
		] as const;

		for (const { field, value, reason } of cases) {
			const evidenceWithoutPerformancePostureTimestamp = {
				...completeEvidence,
				artifactLineage: { ...completeEvidence.artifactLineage },
				performanceGuard: {
					...completeEvidence.performanceGuard,
					[field]: value,
				},
			};
			evidenceWithoutPerformancePostureTimestamp.artifactLineage.artifactSha256 =
				calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
					evidenceWithoutPerformancePostureTimestamp,
				);

			const report = evaluateFoundation({
				evidence: evidenceWithoutPerformancePostureTimestamp,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", field);
			assert.match(report.summary.failClosedReasons.join("\n"), reason, field);
		}
	});

	it("fails closed when performance posture timestamps are malformed, stale, or future-dated", () => {
		const cases = [
			{
				field: "prismaPoolPosture",
				label: "Prisma pool posture",
				base: "pgbouncer=true; connection_limit=3; pool_timeout=10",
			},
			{
				field: "transactionTimeoutPosture",
				label: "transaction timeout posture",
				base: "statement_timeout=2min; idle_in_transaction_session_timeout=30s",
			},
		] as const;
		const timestampCases = [
			{
				suffix: "timestamp=not-a-date",
				reason: (label: string) =>
					new RegExp(`${label} timestamp must be ISO datetime`),
			},
			{
				suffix: "timestamp=2026-06-06T12:00:00.000Z",
				reason: (label: string) =>
					new RegExp(`${label} timestamp must be fresh within 15 minutes`),
			},
			{
				suffix: "verifiedAt=2026-06-06T12:31:00.000Z",
				reason: (label: string) =>
					new RegExp(`${label} timestamp must be fresh within 15 minutes`),
			},
		];

		for (const { field, label, base } of cases) {
			for (const { suffix, reason } of timestampCases) {
				const evidenceWithInvalidPerformancePostureTimestamp = {
					...completeEvidence,
					artifactLineage: { ...completeEvidence.artifactLineage },
					performanceGuard: {
						...completeEvidence.performanceGuard,
						[field]: `${base}; ${suffix}`,
					},
				};
				evidenceWithInvalidPerformancePostureTimestamp.artifactLineage.artifactSha256 =
					calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
						evidenceWithInvalidPerformancePostureTimestamp,
					);

				const report = evaluateFoundation({
					evidence: evidenceWithInvalidPerformancePostureTimestamp,
					now: new Date("2026-06-06T12:30:00.000Z"),
				});

				assert.equal(report.status, "FAIL", `${field} ${suffix}`);
				assert.match(
					report.summary.failClosedReasons.join("\n"),
					reason(label),
					`${field} ${suffix}`,
				);
			}
		}
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
			/PriceHistory baseline requires insert\/read and an explicit metric/,
		);
	});

	it("fails closed when PriceHistory insert/read baseline evidence omits explicit metrics", () => {
		const evidenceWithNominalPriceHistoryBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				priceHistoryBaseline: "PriceHistory insert/read baseline captured",
			},
		};
		evidenceWithNominalPriceHistoryBaseline.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithNominalPriceHistoryBaseline,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithNominalPriceHistoryBaseline,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/PriceHistory baseline requires insert\/read and an explicit metric/,
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
			/cache TTL baseline requires TTL and an explicit temporal value/,
		);
	});

	it("fails closed when cache TTL baseline omits an explicit temporal value", () => {
		const evidenceWithGenericCacheTtlBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				cacheTtlBaseline: "TTL baseline captured",
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
			/cache TTL baseline requires TTL and an explicit temporal value/,
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
			/public API baseline requires search\/products and an explicit performance metric/,
		);
	});

	it("fails closed when public API baseline omits an explicit performance metric", () => {
		const evidenceWithNominalPublicApiBaseline = {
			...completeEvidence,
			performanceGuard: {
				...completeEvidence.performanceGuard,
				publicApiBaseline: "public API search/products baseline captured",
			},
		};
		evidenceWithNominalPublicApiBaseline.artifactLineage.artifactSha256 =
			calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
				evidenceWithNominalPublicApiBaseline,
			);

		const report = evaluateFoundation({
			evidence: evidenceWithNominalPublicApiBaseline,
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "FAIL");
		assert.match(
			report.summary.failClosedReasons.join("\n"),
			/public API baseline requires search\/products and an explicit performance metric/,
		);
	});

	it("fails closed when performance baselines omit explicit fresh timestamps", () => {
		const cases = [
			{
				field: "priceHistoryBaseline",
				value:
					"PriceHistory insert/read baseline captured; insert_p95=50ms; read_p95=30ms",
				reason: /PriceHistory baseline timestamp is required/,
			},
			{
				field: "publicApiBaseline",
				value: "public API search/products baseline captured; p95=120ms",
				reason: /public API baseline timestamp is required/,
			},
			{
				field: "cacheTtlBaseline",
				value: "cache TTL baseline captured; ttl=300s",
				reason: /cache TTL baseline timestamp is required/,
			},
		] as const;

		for (const { field, value, reason } of cases) {
			const evidenceWithoutPerformanceTimestamp = {
				...completeEvidence,
				artifactLineage: { ...completeEvidence.artifactLineage },
				performanceGuard: {
					...completeEvidence.performanceGuard,
					[field]: value,
				},
			};
			evidenceWithoutPerformanceTimestamp.artifactLineage.artifactSha256 =
				calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
					evidenceWithoutPerformanceTimestamp,
				);

			const report = evaluateFoundation({
				evidence: evidenceWithoutPerformanceTimestamp,
				now: new Date("2026-06-06T12:30:00.000Z"),
			});

			assert.equal(report.status, "FAIL", field);
			assert.match(report.summary.failClosedReasons.join("\n"), reason, field);
		}
	});

	it("fails closed when performance baseline timestamps are malformed, stale, or future-dated", () => {
		const cases = [
			{
				field: "priceHistoryBaseline",
				label: "PriceHistory",
				base: "PriceHistory insert/read baseline captured; insert_p95=50ms; read_p95=30ms",
			},
			{
				field: "publicApiBaseline",
				label: "public API",
				base: "public API search/products baseline captured; p95=120ms",
			},
			{
				field: "cacheTtlBaseline",
				label: "cache TTL",
				base: "cache TTL baseline captured; ttl=300s",
			},
		] as const;
		const timestampCases = [
			{
				suffix: "timestamp=not-a-date",
				reason: (label: string) =>
					new RegExp(`${label} baseline timestamp must be ISO datetime`),
			},
			{
				suffix: "timestamp=2026-06-06T12:00:00.000Z",
				reason: (label: string) =>
					new RegExp(
						`${label} baseline timestamp must be fresh within 15 minutes`,
					),
			},
			{
				suffix: "measuredAt=2026-06-06T12:31:00.000Z",
				reason: (label: string) =>
					new RegExp(
						`${label} baseline timestamp must be fresh within 15 minutes`,
					),
			},
		];

		for (const { field, label, base } of cases) {
			for (const { suffix, reason } of timestampCases) {
				const evidenceWithInvalidPerformanceTimestamp = {
					...completeEvidence,
					artifactLineage: { ...completeEvidence.artifactLineage },
					performanceGuard: {
						...completeEvidence.performanceGuard,
						[field]: `${base}; ${suffix}`,
					},
				};
				evidenceWithInvalidPerformanceTimestamp.artifactLineage.artifactSha256 =
					calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
						evidenceWithInvalidPerformanceTimestamp,
					);

				const report = evaluateFoundation({
					evidence: evidenceWithInvalidPerformanceTimestamp,
					now: new Date("2026-06-06T12:30:00.000Z"),
				});

				assert.equal(report.status, "FAIL", `${field} ${suffix}`);
				assert.match(
					report.summary.failClosedReasons.join("\n"),
					reason(label),
					`${field} ${suffix}`,
				);
			}
		}
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
		assert.equal(policy.schemaConstraints.migrationStatus, "PASS");
		assert.equal(
			policy.schemaConstraints.migrationEvidence?.scope,
			"direct-refresh-discovery-prewrite-foundation",
		);
		assert.equal(
			policy.schemaConstraints.migrationEvidence?.noMigrationExecution,
			true,
		);
		assert.match(policy.artifactLineage.sourceConfigSnapshot, /^sha256:[a-f0-9]{64}; files:/);
		assert.equal(typeof policy.artifactLineage.vtexProbeHash, "string");
		assert.equal(policy.vtexBudgets.concurrency, 1);
		assert.equal(policy.alertChannel.rollbackRequired, true);
		assert.match(policy.generatedAt, /^<ISO timestamp captured within 15 minutes/);
		assert.match(policy.alertChannel.testAlertProof, /timestamp=<ISO timestamp/);
		assert.match(policy.rollbackDrill.pitrBackupPosture, /rollback verification tooling/);
		assert.doesNotMatch(reasons, /TTL policy is required/);
		assert.doesNotMatch(reasons, /idempotency policy is required/);
		assert.doesNotMatch(reasons, /source config snapshot is required/);
		assert.doesNotMatch(reasons, /VTEX request cap must be positive/);
		assert.doesNotMatch(reasons, /alert channel is required/);
		assert.equal(report.status, "FAIL");
		assert.match(reasons, /foundation evidence generatedAt is required/);
		assert.match(reasons, /rollback drill must be executed/);
		assert.doesNotMatch(reasons, /migration status must be PASS/);
		assert.doesNotMatch(reasons, /migration evidence must prove bounded/);
	});
});
