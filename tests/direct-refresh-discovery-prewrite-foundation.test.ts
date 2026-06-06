import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
	evaluateDirectRefreshDiscoveryPrewriteFoundation,
	parseDirectRefreshDiscoveryPrewriteFoundationCliOptions,
	parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson,
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
		artifactPath: "audit/direct-refresh-discovery-prewrite-foundation/foundation-evidence.json",
		artifactSha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		gitCommit: "ccc7535",
		toolVersion: "direct-refresh-discovery-create@1",
		schemaVersion: "1",
		dbEnvironmentIdentity: "local-test-db",
		sourceConfigSnapshot:
			"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb; files:src/lib/supermarkets.ts",
		vtexProbeTimestamp: "2026-06-06T12:00:00.000Z",
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
			evidence: completeEvidence,
			evidencePath: "foundation.json",
			now: new Date("2026-06-06T12:30:00.000Z"),
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.dryRun, true);
		assert.match(report.writeBoundary, /no discovery apply/);
		assert.equal(report.summary.passCount, report.checks.length);
		assert.deepEqual(report.summary.failClosedReasons, []);
	});

	it("fails closed when Phase 1 foundation evidence is stale", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when artifact lineage omits issue, source, count, attempt, path, or hash", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		assert.match(reasons, /issue lineage is required/);
		assert.match(reasons, /source lineage must be writer-supported/);
		assert.match(reasons, /count lineage is required/);
		assert.match(reasons, /attempt lineage is required/);
		assert.match(reasons, /artifact path lineage must be foundation audit json/);
		assert.match(reasons, /artifact sha256 lineage is required/);
	});

	it("fails closed when source config snapshot or VTEX probe timestamp are malformed", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when commit, tool version, or schema version lineage are malformed", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		assert.match(reasons, /tool version lineage must include @version/);
		assert.match(reasons, /schema version lineage must be numeric/);
	});

	it("fails closed when source, artifact path, or DB environment lineage are invalid", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		assert.match(reasons, /PITR\/backup posture is required/);
		assert.match(reasons, /rollback cache handling is required/);
	});

	it("fails closed when preimage artifact evidence is missing or malformed", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when rollback IDs are broad selectors instead of exact table IDs", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when alert channel or owner are placeholders", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when alert policy omits severity, SLA, escalation, suppression, retry, or test proof", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when performance, VTEX budget, or compliance gates are incomplete", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		assert.match(reasons, /VTEX request cap must be positive/);
		assert.match(reasons, /compliance allowed-use review is required/);
		assert.match(reasons, /public API baseline must include search and products/);
	});

	it("fails closed when VTEX budgets are not tightly bounded", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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

	it("fails closed when VTEX safety policies are too vague", () => {
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
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
			/Prisma pool posture must include pgbouncer, connection_limit, and pool_timeout/,
		);
		assert.match(
			reasons,
			/transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout/,
		);
		assert.match(reasons, /PriceHistory baseline must include insert and read/);
		assert.match(reasons, /public API baseline must include search and products/);
		assert.match(reasons, /cache TTL baseline must include TTL/);
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
		const report = evaluateDirectRefreshDiscoveryPrewriteFoundation({
			evidence: policy,
			evidencePath: "docs/direct-refresh-discovery-prewrite-foundation-policy.json",
		});
		const reasons = report.summary.failClosedReasons.join("\n");

		assert.equal(policy.controlPlane.ttlPolicy, true);
		assert.equal(policy.controlPlane.idempotencyPolicy, true);
		assert.match(policy.artifactLineage.sourceConfigSnapshot, /^sha256:[a-f0-9]{64}; files:/);
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
