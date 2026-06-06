import { getOptionalSingleFlag, uniqueSorted } from "./audit-utils";

export type DirectRefreshDiscoveryPrewriteFoundationStatus = "PASS" | "FAIL";
export type DirectRefreshDiscoveryPrewriteFoundationEvidence = {
	schemaConstraints: {
		productEanPrimaryKey: boolean;
		productSourceUnique: boolean;
		sourceSkuUniqueNonnull: boolean;
		priceHistoryIndex: boolean;
		stagingProductIndex: boolean;
		ledgerUniqueness: boolean;
		migrationStatus: "PASS" | "FAIL" | "UNKNOWN";
	};
	controlPlane: {
		sourceLock: boolean;
		ledgerAttemptIdentity: boolean;
		ttlPolicy: boolean;
		owner: string;
		stopResumeStates: boolean;
		idempotencyPolicy: boolean;
	};
	artifactLineage: {
		gitCommit: string;
		toolVersion: string;
		schemaVersion: string;
		dbEnvironmentIdentity: string;
		sourceConfigSnapshot: string;
		vtexProbeTimestamp: string;
	};
	rollbackDrill: {
		executed: boolean;
		mode: "non-prod-prod-like" | "controlled-disposable-row" | "read-only-review";
		rollbackIds: string[];
		postRollbackVerification: boolean;
	};
	vtexBudgets: {
		requestCap: number;
		concurrency: number;
		timeoutMs: number;
		backoffPolicy: string;
		stopRule: string;
		headerPolicy: string;
	};
	compliance: {
		allowedUseReviewed: boolean;
		posture: "approved" | "risk-accepted" | "blocked" | "unknown";
	};
	alertChannel: {
		channel: string;
		owner: string;
		writeFailure: boolean;
		postwriteFailure: boolean;
		rollbackRequired: boolean;
	};
	performanceGuard: {
		prismaPoolPosture: string;
		transactionTimeoutPosture: string;
		priceHistoryBaseline: string;
		publicApiBaseline: string;
		cacheTtlBaseline: string;
	};
};
export type DirectRefreshDiscoveryPrewriteFoundationCliOptions = {
	evidence: string;
	output: string;
};

type Rule = [boolean, string];

const WRITE_BOUNDARY =
	"read-only discovery prewrite foundation audit; no discovery apply, no VTEX live scan, no scheduler/all-source/retry side effects" as const;
const FORBIDDEN_FLAGS = [
	"--apply",
	"--confirm-write",
	"--active",
	"--write",
	"--all-source",
	"--all-sources",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--retry",
	"--retries",
	"--purge-cache",
	"--cache-purge",
	"--deploy",
	"--secrets",
	"--remote-config",
	"--vtex-scan",
];
const ALLOWED_FLAGS = new Set(["--evidence", "--output"]);

export function parseDirectRefreshDiscoveryPrewriteFoundationCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshDiscoveryPrewriteFoundationCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(
			`direct-refresh discovery prewrite foundation rejects ${foundForbidden}`,
		);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(
			`unknown direct-refresh discovery prewrite foundation flag ${unknownFlag}`,
		);
	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(
			`direct-refresh discovery prewrite foundation requires ${bareAllowedFlag}=...`,
		);
	const evidence = getOptionalSingleFlag(argv, "--evidence");
	if (!evidence)
		throw new Error("direct-refresh discovery prewrite foundation requires --evidence=...");
	return {
		evidence,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			`audit/direct-refresh-discovery-prewrite-foundation/${now.toISOString().replaceAll(":", "-")}/foundation-report.json`,
	};
}

export function evaluateDirectRefreshDiscoveryPrewriteFoundation({
	evidence,
	evidencePath,
	now = new Date(),
}: {
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence;
	evidencePath: string;
	now?: Date;
}) {
	const checks = buildChecks(evidence);
	const failClosedReasons = uniqueSorted(checks.flatMap((check) => check.reasons));
	const failCount = checks.filter((check) => check.status === "FAIL").length;
	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-prewrite-foundation",
		status: failCount === 0 ? "PASS" : "FAIL",
		generatedAt: now.toISOString(),
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		evidencePath,
		summary: {
			passCount: checks.length - failCount,
			failCount,
			failClosedReasons,
			discoveryApplyGate:
				failCount === 0 ? "ready-for-pilot-gates" : "blocked",
		},
		checks,
	};
}

function buildChecks(evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence) {
	const schema = evidence.schemaConstraints;
	const control = evidence.controlPlane;
	const lineage = evidence.artifactLineage;
	const rollback = evidence.rollbackDrill;
	const budget = evidence.vtexBudgets;
	const compliance = evidence.compliance;
	const alert = evidence.alertChannel;
	const perf = evidence.performanceGuard;
	return [
		check("schema-constraints", [
			[schema.productEanPrimaryKey, "Product.ean primary key is required"],
			[schema.productSourceUnique, "SupermarketProduct(product_ean, supermarket_id) unique is required"],
			[schema.sourceSkuUniqueNonnull, "SupermarketProduct(supermarket_id, sku_id) non-null unique guard is required"],
			[schema.priceHistoryIndex, "PriceHistory(supermarket_product_id, scraped_at) index is required"],
			[schema.stagingProductIndex, "StagingProduct(ean, source_slug) index is required"],
			[schema.ledgerUniqueness, "DirectRefreshRunLedger uniqueness is required"],
			[schema.migrationStatus === "PASS", "migration status must be PASS"],
		]),
		check("control-plane", [
			[control.sourceLock, "source lock is required"],
			[control.ledgerAttemptIdentity, "ledger attempt identity is required"],
			[control.ttlPolicy, "TTL policy is required"],
			[hasText(control.owner), "owner is required"],
			[control.stopResumeStates, "stop/resume states are required"],
			[control.idempotencyPolicy, "idempotency policy is required"],
		]),
		check("artifact-lineage", [
			[hasText(lineage.gitCommit), "git commit lineage is required"],
			[hasText(lineage.toolVersion), "tool version lineage is required"],
			[hasText(lineage.schemaVersion), "schema version lineage is required"],
			[hasText(lineage.dbEnvironmentIdentity), "DB/environment identity is required"],
			[hasText(lineage.sourceConfigSnapshot), "source config snapshot is required"],
			[hasText(lineage.vtexProbeTimestamp), "VTEX probe timestamp is required"],
		]),
		check("rollback-drill", [
			[rollback.executed, "rollback drill must be executed before discovery apply"],
			[rollback.mode !== "read-only-review", "read-only rollback review is preparatory only"],
			[rollback.rollbackIds.length > 0, "rollback IDs are required"],
			[rollback.postRollbackVerification, "post-rollback verification is required"],
		]),
		check("vtex-budgets", [
			[budget.requestCap > 0, "VTEX request cap must be positive"],
			[budget.concurrency > 0, "VTEX concurrency must be positive"],
			[budget.timeoutMs > 0, "VTEX timeout must be positive"],
			[hasText(budget.backoffPolicy), "VTEX backoff policy is required"],
			[hasText(budget.stopRule), "VTEX stop rule is required"],
			[hasText(budget.headerPolicy), "VTEX header policy is required"],
		]),
		check("compliance", [
			[compliance.allowedUseReviewed, "compliance allowed-use review is required"],
			[compliance.posture === "approved" || compliance.posture === "risk-accepted", "compliance posture must be approved or risk-accepted"],
		]),
		check("alert-channel", [
			[hasText(alert.channel), "alert channel is required"],
			[hasText(alert.owner), "alert owner is required"],
			[alert.writeFailure, "write failure alert is required"],
			[alert.postwriteFailure, "postwrite failure alert is required"],
			[alert.rollbackRequired, "rollback-required alert is required"],
		]),
		check("performance-guard", [
			[hasText(perf.prismaPoolPosture), "Prisma pool posture is required"],
			[hasText(perf.transactionTimeoutPosture), "transaction timeout posture is required"],
			[hasText(perf.priceHistoryBaseline), "PriceHistory baseline is required"],
			[hasText(perf.publicApiBaseline), "public API baseline is required"],
			[hasText(perf.cacheTtlBaseline), "cache TTL baseline is required"],
		]),
	];
}

function check(name: string, rules: Rule[]) {
	const reasons = rules.filter(([passed]) => !passed).map(([, reason]) => reason);
	return { name, status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

function hasText(value: string) {
	return value.trim().length > 0;
}
