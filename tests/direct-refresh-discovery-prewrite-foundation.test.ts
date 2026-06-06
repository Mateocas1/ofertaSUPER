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
		owner: "Direct-refresh operator",
		stopResumeStates: true,
		idempotencyPolicy: true,
	},
	artifactLineage: {
		gitCommit: "ccc7535",
		toolVersion: "direct-refresh-discovery-create@1",
		schemaVersion: "1",
		dbEnvironmentIdentity: "local-test-db",
		sourceConfigSnapshot: "config-hash",
		vtexProbeTimestamp: "2026-06-06T12:00:00.000Z",
	},
	rollbackDrill: {
		executed: true,
		mode: "controlled-disposable-row",
		rollbackIds: ["supermarket_products:901", "price_history:1001"],
		postRollbackVerification: true,
	},
	vtexBudgets: {
		requestCap: 20,
		concurrency: 1,
		timeoutMs: 10_000,
		backoffPolicy: "stop-on-429",
		stopRule: "source STOPPED on blocked/rate-limit/hash_invalid",
		headerPolicy: "documented non-evasive headers",
	},
	compliance: {
		allowedUseReviewed: true,
		posture: "approved",
	},
	alertChannel: {
		channel: "Issue comment + #direct-refresh-alerts",
		owner: "Direct-refresh operator",
		writeFailure: true,
		postwriteFailure: true,
		rollbackRequired: true,
	},
	performanceGuard: {
		prismaPoolPosture: "bounded",
		transactionTimeoutPosture: "bounded",
		priceHistoryBaseline: "insert/read baseline captured",
		publicApiBaseline: "search/product baseline captured",
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
		assert.match(reasons, /public API baseline is required/);
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
		assert.match(reasons, /public API baseline is required/);
	});
});
