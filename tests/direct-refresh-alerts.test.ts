import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDirectRefreshAlertsCliOptions } from "../scripts/audit-direct-refresh-alerts";
import { evaluateDirectRefreshAlerts } from "../scripts/pipeline/direct-refresh-alerts";

const now = new Date("2026-06-04T12:00:00.000Z");

function alertConditions(report: ReturnType<typeof evaluateDirectRefreshAlerts>) {
	return report.alerts.map((alert) => alert.condition);
}

describe("direct-refresh alerts", () => {
	it("passes with supplied PASS artifacts and no required missing artifacts", () => {
		const report = evaluateDirectRefreshAlerts({
			now,
			paths: {
				sourceHealth: "source-health.json",
				freshnessBaseline: "baseline.json",
				manifest: "manifest.json",
				prewrite: "prewrite.json",
				postwrite: "postwrite.json",
				noPartial: null,
				errorArtifact: null,
				activeWrite: null,
			},
			artifacts: {
				sourceHealth: { audit: "direct-refresh-source-health", status: "PASS", sources: [] },
				freshnessBaseline: { audit: "freshness-baseline", status: "PASS" },
				manifest: { audit: "vea-direct-refresh-manifest-dry-run", status: "PASS" },
				prewrite: {
					audit: "vea-direct-refresh-prewrite-gate",
					status: "PASS",
					generatedAt: "2026-06-04T11:55:00.000Z",
				},
				postwrite: { audit: "vea-direct-refresh-postwrite-audit", status: "PASS", noCreate: { productDelta: 0, supermarketProductDelta: 0 } },
			},
		});

		assert.equal(report.status, "PASS");
		assert.equal(report.summary.alertCount, 0);
		assert.match(report.writeBoundary, /no notification delivery/);
		assert.match(report.writeBoundary, /no production writes/);
		assert.equal(report.summary.schedulerGate, "blocked");
	});

	it("maps source health FAIL and WARN to policy severities", () => {
		const report = evaluateDirectRefreshAlerts({
			now,
			paths: { sourceHealth: "source-health.json" },
			artifacts: {
				sourceHealth: {
					audit: "direct-refresh-source-health",
					status: "WARN",
					sources: [
						{ slug: "vea", status: "FAIL", reasons: ["source base URL is invalid"] },
						{ slug: "mas", status: "WARN", reasons: ["freshness below target"] },
					],
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.deepEqual(alertConditions(report), ["source_health_fail", "source_health_warn"]);
		assert.equal(report.alerts[0].severity, "HIGH");
		assert.equal(report.alerts[1].severity, "MEDIUM");
		assert.equal(report.alerts[0].source, "vea");
	});

	it("maps freshness baseline FAIL and WARN", () => {
		const failed = evaluateDirectRefreshAlerts({
			now,
			artifacts: {
				freshnessBaseline: {
					audit: "freshness-baseline",
					status: "FAIL",
					summary: { overallFreshnessPercent: 40 },
					denominatorDeltas: { status: "FAIL", blockers: ["public rankable shrinkage"] },
				},
			},
		});
		assert.equal(failed.status, "FAIL");
		assert.equal(failed.alerts[0].condition, "freshness_baseline_fail");
		assert.equal(failed.alerts[0].severity, "HIGH");

		const warned = evaluateDirectRefreshAlerts({
			now,
			artifacts: { freshnessBaseline: { audit: "freshness-baseline", status: "WARN" } },
		});
		assert.equal(warned.status, "WARN");
		assert.equal(warned.alerts[0].condition, "freshness_baseline_warn");
	});

	it("maps manifest/prewrite failures and stale prewrite", () => {
		const report = evaluateDirectRefreshAlerts({
			now,
			paths: { manifest: "manifest.json", prewrite: "prewrite.json" },
			artifacts: {
				manifest: {
					audit: "vea-direct-refresh-manifest-dry-run",
					status: "FAIL",
					source: { slug: "vea" },
					summary: { failClosedReasons: ["no rows selected"] },
				},
				prewrite: {
					audit: "vea-direct-refresh-prewrite-gate",
					status: "FAIL",
					source: { slug: "vea" },
					generatedAt: "2026-06-04T11:00:00.000Z",
					summary: { failClosedReasons: ["row mismatch"] },
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.deepEqual(alertConditions(report), ["manifest_fail", "prewrite_fail", "prewrite_stale"]);
		assert.equal(report.alerts[2].retryAllowed, true);
	});

	it("classifies error artifacts for timeout, pool exhaustion, transaction, stale, and mismatch", () => {
		const cases = [
			["Transaction API error: timeout", "active_writer_timeout", "CRITICAL"],
			["Timed out fetching a new connection from the connection pool", "prisma_pool_exhaustion", "HIGH"],
			["P2028 Transaction not found", "prisma_transaction_not_found", "CRITICAL"],
			["prewrite report is stale; maximum age is 15 minutes", "prewrite_stale", "HIGH"],
			["prewrite report hash mismatch", "confirmation_mismatch", "HIGH"],
		] as const;

		for (const [message, condition, severity] of cases) {
			const report = evaluateDirectRefreshAlerts({
				now,
				paths: { errorArtifact: "error.json", noPartial: "no-partial.json" },
				artifacts: { errorArtifact: { artifact: "direct-refresh-error", source: "mas", error: message, stoppedBeforeTransaction: true } },
			});
			assert.equal(report.status, "FAIL");
			assert.equal(report.alerts[0].condition, condition);
			assert.equal(report.alerts[0].severity, severity);
			assert.equal(report.alerts[0].source, "mas");
			assert.equal(report.alerts[0].noPartialVerificationPath, "no-partial.json");
		}
	});

	it("maps postwrite FAIL, no-create violations, and no-partial FAIL to CRITICAL", () => {
		const report = evaluateDirectRefreshAlerts({
			now,
			paths: { postwrite: "postwrite.json", noPartial: "no-partial.json", activeWrite: "write.json" },
			artifacts: {
				postwrite: {
					audit: "vea-direct-refresh-postwrite-audit",
					status: "FAIL",
					writeReport: { source: "vea" },
					summary: { failClosedReasons: ["row failed"] },
					noCreate: { productDelta: 1, supermarketProductDelta: 0 },
				},
				activeWrite: {
					report: "vea-direct-refresh-active-write",
					source: { slug: "vea" },
					noCreate: { productDelta: 0, supermarketProductDelta: 1 },
				},
				noPartial: {
					audit: "direct-refresh-no-partial-verification",
					source: "vea",
					conclusion: "FAIL",
					failedCommand: "npm run direct-refresh:vea-write",
				},
			},
		});

		assert.equal(report.status, "FAIL");
		assert.deepEqual(alertConditions(report), [
			"postwrite_fail",
			"no_create_invariant_violation",
			"no_create_invariant_violation",
			"no_partial_verification_fail",
		]);
		assert.equal(report.summary.criticalCount, 4);
		assert.equal(report.alerts[3].retryAllowed, false);
	});

	it("alerts when required postwrite or baseline artifacts are missing", () => {
		const report = evaluateDirectRefreshAlerts({
			now,
			source: "vea",
			requirePostwrite: true,
			requireBaseline: true,
		});

		assert.equal(report.status, "FAIL");
		assert.deepEqual(alertConditions(report), ["missing_postwrite_artifact", "missing_baseline_artifact"]);
		assert.equal(report.summary.highCount, 2);
	});

	it("parses CLI defaults and allowed inputs", () => {
		const options = parseDirectRefreshAlertsCliOptions(
			[
				"node",
				"script",
				"--source=vea",
				"--source-health=source-health.json",
				"--freshness-baseline=baseline.json",
				"--manifest=manifest.json",
				"--prewrite=prewrite.json",
				"--postwrite=postwrite.json",
				"--no-partial=no-partial.json",
				"--error-artifact=error.json",
				"--active-write=write.json",
				"--require-postwrite=true",
				"--require-baseline=false",
				"--max-prewrite-age-minutes=10",
			],
			now,
		);

		assert.equal(options.source, "vea");
		assert.equal(options.paths.sourceHealth, "source-health.json");
		assert.equal(options.paths.activeWrite, "write.json");
		assert.equal(options.requirePostwrite, true);
		assert.equal(options.requireBaseline, false);
		assert.equal(options.maxPrewriteAgeMinutes, 10);
		assert.match(options.output, /audit\/direct-refresh-alerts/);
	});

	it("rejects unsafe, unknown, bare, and invalid flags", () => {
		for (const flag of [
			"--write",
			"--confirm-write=1",
			"--all-source",
			"--scheduler=true",
			"--retry",
			"--notify",
			"--notification",
			"--notifications=true",
			"--webhook=https://example.test",
			"--slack",
			"--deploy",
			"--refresh",
		]) {
			assert.throws(
				() => parseDirectRefreshAlertsCliOptions(["node", "script", flag]),
				/direct-refresh alerts rejects/,
			);
		}
		assert.throws(
			() => parseDirectRefreshAlertsCliOptions(["node", "script", "--dry-run"]),
			/unknown direct-refresh alerts flag/,
		);
		assert.throws(
			() => parseDirectRefreshAlertsCliOptions(["node", "script", "--source"]),
			/requires --source=\.\.\./,
		);
		assert.throws(
			() =>
				parseDirectRefreshAlertsCliOptions([
					"node",
					"script",
					"--require-postwrite=yes",
				]),
			/requires --require-postwrite=true or --require-postwrite=false/,
		);
		assert.throws(
			() =>
				parseDirectRefreshAlertsCliOptions([
					"node",
					"script",
					"--max-prewrite-age-minutes=0",
				]),
			/requires --max-prewrite-age-minutes=\.\.\. to be positive/,
		);
	});
});
