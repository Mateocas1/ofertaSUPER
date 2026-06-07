import { createHash } from "node:crypto";

import { getOptionalSingleFlag, uniqueSorted } from "./audit-utils";

export type DirectRefreshDiscoveryPrewriteFoundationStatus = "PASS" | "FAIL";
export type DirectRefreshDiscoveryPrewriteFoundationEvidence = {
	generatedAt: string;
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
		issue: number;
		source: string;
		count: number;
		attemptId: string;
		artifactPath: string;
		artifactSha256: string;
		gitCommit: string;
		toolVersion: string;
		schemaVersion: string;
		dbEnvironmentIdentity: string;
		sourceConfigSnapshot: string;
		vtexProbeSource: string;
		vtexProbeHash: string;
		vtexProbeTimestamp: string;
	};
	rollbackDrill: {
		executed: boolean;
		mode: "non-prod-prod-like" | "controlled-disposable-row" | "read-only-review";
		rollbackIds: string[];
		postRollbackVerification: boolean;
		postRollbackVerificationArtifact: string;
		postRollbackVerificationSha256: string;
		preimageCaptured: boolean;
		preimageArtifact: string;
		preimageSha256: string;
		pitrBackupPosture: string;
		cacheHandling: string;
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
		reviewedSources: string[];
	};
	alertChannel: {
		channel: string;
		owner: string;
		severity: string;
		ackSla: string;
		resolutionSla: string;
		escalationPath: string;
		suppressionPolicy: string;
		retryPolicy: string;
		testAlertProof: string;
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
const FOUNDATION_EVIDENCE_MAX_AGE_MS = 15 * 60 * 1000;
const MAX_VTEX_FOUNDATION_REQUEST_CAP = 20;
const MAX_VTEX_FOUNDATION_TIMEOUT_MS = 10_000;
const WRITER_SUPPORTED_SOURCES = new Set(["carrefour", "vea", "disco", "jumbo", "mas"]);

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
	evidenceSha256,
	sourceConfigSnapshotSha256,
	rollbackPreimageSha256,
	postRollbackVerificationSha256,
	now = new Date(),
}: {
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence;
	evidencePath: string;
	evidenceSha256: string;
	sourceConfigSnapshotSha256: string;
	rollbackPreimageSha256: string | undefined;
	postRollbackVerificationSha256: string | undefined;
	now?: Date;
}) {
	const checks = buildChecks(
		evidence,
		evidencePath,
		evidenceSha256,
		sourceConfigSnapshotSha256,
		rollbackPreimageSha256,
		postRollbackVerificationSha256,
		now,
	);
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

export function parseDirectRefreshDiscoveryPrewriteFoundationEvidenceJson(
	raw: string,
): DirectRefreshDiscoveryPrewriteFoundationEvidence {
	return JSON.parse(raw.replace(/^\uFEFF/, "")) as DirectRefreshDiscoveryPrewriteFoundationEvidence;
}

export function calculateDirectRefreshDiscoveryPrewriteFoundationEvidenceSha256(
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence,
) {
	const canonicalEvidence = {
		...evidence,
		artifactLineage: {
			...(evidence.artifactLineage ?? {}),
			artifactSha256: "",
		},
	};
	return `sha256:${createHash("sha256")
		.update(stableStringify(canonicalEvidence))
		.digest("hex")}`;
}

export function calculateDirectRefreshDiscoverySourceConfigSnapshotSha256(
	files: Array<{ path: string; content: string }>,
) {
	const canonicalFiles = files
		.map((file) => ({ path: normalizeAuditPath(file.path), content: file.content }))
		.sort((left, right) => left.path.localeCompare(right.path));
	return `sha256:${createHash("sha256")
		.update(stableStringify(canonicalFiles))
		.digest("hex")}`;
}

export function parseDirectRefreshDiscoverySourceConfigSnapshotFiles(
	value: string | undefined,
) {
	const match = value?.match(/^sha256:[a-f0-9]{64}; files:(\S+)$/);
	const files = match ? match[1].split(",").filter((file) => file.length > 0) : [];
	if (files.length === 0) {
		throw new Error("source config snapshot files must include at least one file");
	}
	if (!files.every(isSafeSourceConfigSnapshotPath)) {
		throw new Error(
			"source config snapshot files must be workspace-relative safe paths",
		);
	}
	return files;
}

function isSafeSourceConfigSnapshotPath(value: string) {
	return (
		/^[A-Za-z0-9._/-]+$/.test(value) &&
		!value.startsWith("/") &&
		!value.includes("\\") &&
		!value.split("/").includes("..") &&
		!value.includes(":")
	);
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

function buildChecks(
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence,
	evidencePath: string,
	evidenceSha256: string,
	sourceConfigSnapshotSha256: string,
	rollbackPreimageSha256: string | undefined,
	postRollbackVerificationSha256: string | undefined,
	now: Date,
) {
	const schema = evidence.schemaConstraints ?? {};
	const control = evidence.controlPlane ?? {};
	const lineage = evidence.artifactLineage ?? {};
	const rollback = evidence.rollbackDrill ?? {};
	const budget = evidence.vtexBudgets ?? {};
	const compliance = evidence.compliance ?? {};
	const alert = evidence.alertChannel ?? {};
	const perf = evidence.performanceGuard ?? {};
	return [
		check("evidence-freshness", buildEvidenceFreshnessRules(evidence, now)),
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
			[hasExplicitOwner(control.owner), "control-plane owner must be explicit and non-placeholder"],
			[control.stopResumeStates, "stop/resume states are required"],
			[control.idempotencyPolicy, "idempotency policy is required"],
		]),
		check("artifact-lineage", [
			[hasPositiveInteger(lineage.issue), "issue lineage must be a positive integer"],
			[hasWriterSupportedSource(lineage.source), "source lineage must be writer-supported"],
			[hasPositiveInteger(lineage.count), "count lineage must be a positive integer"],
			[hasSafeAttemptId(lineage.attemptId), "attempt lineage must be a safe attempt ID"],
			[
				hasFoundationArtifactPath(lineage.artifactPath),
				"artifact path lineage must be foundation audit json",
			],
			[
				hasMatchingArtifactPath(lineage.artifactPath, evidencePath),
				"artifact path lineage must match evidence path",
			],
			[
				hasArtifactPathAttemptLineage(lineage.artifactPath, lineage.attemptId),
				"artifact path lineage must include attempt ID",
			],
			[
				hasArtifactPathSourceCountLineage(
					lineage.artifactPath,
					lineage.source,
					lineage.count,
				),
				"artifact path lineage must include source and count",
			],
			[
				hasArtifactPathIssueLineage(lineage.artifactPath, lineage.issue),
				"artifact path lineage must include issue",
			],
			[
				hasCanonicalArtifactPathLineage(
					lineage.artifactPath,
					lineage.issue,
					lineage.source,
					lineage.count,
					lineage.attemptId,
				),
				"artifact path lineage must follow issue/source/count/attempt order",
			],
			[hasSha256Lineage(lineage.artifactSha256), "artifact sha256 lineage is required"],
			[
				hasMatchingArtifactSha256(lineage.artifactSha256, evidenceSha256),
				"artifact sha256 lineage must match evidence file hash",
			],
			[hasGitCommitLineage(lineage.gitCommit), "git commit lineage must be hex"],
			[
				hasToolVersionLineage(lineage.toolVersion),
				"tool version lineage must include positive @version",
			],
			[hasNumericSchemaVersion(lineage.schemaVersion), "schema version lineage must be numeric"],
			[hasExplicitEnvironmentIdentity(lineage.dbEnvironmentIdentity), "DB/environment identity must be explicit"],
			[hasSourceConfigSnapshot(lineage.sourceConfigSnapshot), "source config snapshot sha256 is required"],
			[
				hasSafeSourceConfigSnapshotFiles(lineage.sourceConfigSnapshot),
				"source config snapshot files must be workspace-relative safe paths",
			],
			[
				hasMatchingSourceConfigSnapshot(
					lineage.sourceConfigSnapshot,
					sourceConfigSnapshotSha256,
				),
				"source config snapshot sha256 must match runtime files",
			],
			[hasIsoDatetime(lineage.vtexProbeTimestamp), "VTEX probe timestamp must be ISO datetime"],
			[
				hasFreshTimestamp(lineage.vtexProbeTimestamp, now),
				"VTEX probe timestamp must be fresh within 15 minutes",
			],
			[
				hasMatchingVtexProbeSource(lineage.vtexProbeSource, lineage.source),
				"VTEX probe source must match lineage source",
			],
			[hasSha256Lineage(lineage.vtexProbeHash), "VTEX probe hash lineage is required"],
		]),
		check("rollback-drill", [
			[rollback.executed, "rollback drill must be executed before discovery apply"],
			[rollback.mode !== "read-only-review", "read-only rollback review is preparatory only"],
			[rollback.preimageCaptured === true, "rollback preimage capture is required"],
			[hasRollbackVerificationArtifact(rollback.preimageArtifact), "preimage artifact must be rollback verification audit json"],
			[hasSha256Lineage(rollback.preimageSha256), "preimage sha256 is required"],
			[
				hasMatchingArtifactSha256(
					rollback.preimageSha256,
					rollbackPreimageSha256 ?? "",
				),
				"preimage sha256 must match runtime preimage artifact",
			],
			[hasPitrBackupPosture(rollback.pitrBackupPosture), "PITR/backup posture must include PITR or backup and reviewed or available"],
			[
				Array.isArray(rollback.rollbackIds) && rollback.rollbackIds.length > 0,
				"rollback IDs are required",
			],
			[hasExactRollbackIds(rollback.rollbackIds), "rollback IDs must be exact table:id entries"],
			[
				hasMinimumRollbackTableCoverage(rollback.rollbackIds),
				"rollback IDs must include supermarket_products and price_history entries",
			],
			[
				hasRollbackTableCoverageForCount(rollback.rollbackIds, lineage.count),
				"rollback ID coverage must be at least count lineage per affected table",
			],
			[rollback.postRollbackVerification, "post-rollback verification is required"],
			[hasRollbackVerificationArtifact(rollback.postRollbackVerificationArtifact), "post-rollback verification artifact must be rollback verification audit json"],
			[hasSha256Lineage(rollback.postRollbackVerificationSha256), "post-rollback verification sha256 is required"],
			[
				hasMatchingArtifactSha256(
					rollback.postRollbackVerificationSha256,
					postRollbackVerificationSha256 ?? "",
				),
				"post-rollback verification sha256 must match runtime artifact",
			],
			[hasText(rollback.cacheHandling), "rollback cache handling is required"],
		]),
		check("vtex-budgets", [
			[hasPositiveInteger(budget.requestCap), "VTEX request cap must be a positive integer"],
			[budget.requestCap <= MAX_VTEX_FOUNDATION_REQUEST_CAP, "VTEX request cap must be <= 20"],
			[
				hasPositiveInteger(lineage.count) && lineage.count <= budget.requestCap,
				"count lineage must not exceed VTEX request cap",
			],
			[hasPositiveInteger(budget.concurrency), "VTEX concurrency must be a positive integer"],
			[budget.concurrency === 1, "VTEX concurrency must be serial"],
			[hasPositiveInteger(budget.timeoutMs), "VTEX timeout must be a positive integer in milliseconds"],
			[budget.timeoutMs <= MAX_VTEX_FOUNDATION_TIMEOUT_MS, "VTEX timeout must be <= 10000ms"],
			[hasVtexBackoffPolicy(budget.backoffPolicy), "VTEX backoff policy must include timeout, 403, 429, HTML, and captcha"],
			[hasVtexStopRule(budget.stopRule), "VTEX stop rule must stop source on blocked, rate-limit, hash_invalid, and no automatic retry"],
			[hasVtexHeaderPolicy(budget.headerPolicy), "VTEX header policy must be documented and non-evasive"],
		]),
		check("compliance", [
			[compliance.allowedUseReviewed, "compliance allowed-use review is required"],
			[compliance.posture === "approved" || compliance.posture === "risk-accepted", "compliance posture must be approved or risk-accepted"],
			[
				hasComplianceForSource(compliance.reviewedSources, lineage.source),
				"compliance reviewed sources must include lineage source",
			],
		]),
		check("alert-channel", [
			[hasActionableAlertChannel(alert.channel), "alert channel must include issue evidence comment and concrete alert destination"],
			[hasExplicitAlertOwner(alert.owner), "alert owner must be explicit and non-placeholder"],
			[hasAlertSeverity(alert.severity), "alert severity must include write, postwrite, and rollback-required"],
			[hasAlertAckSla(alert.ackSla), "alert ack SLA is required"],
			[hasAlertResolutionSla(alert.resolutionSla), "alert resolution SLA is required"],
			[hasAlertEscalationPath(alert.escalationPath), "alert escalation path must be explicit"],
			[hasAlertSuppressionPolicy(alert.suppressionPolicy), "alert suppression policy must describe suppression/noise handling"],
			[hasAlertRetryPolicy(alert.retryPolicy), "alert retry policy must be explicit"],
			[hasTestAlertProof(alert.testAlertProof), "test-alert proof is required"],
			[alert.writeFailure, "write failure alert is required"],
			[alert.postwriteFailure, "postwrite failure alert is required"],
			[alert.rollbackRequired, "rollback-required alert is required"],
		]),
		check("performance-guard", [
			[hasPrismaPoolPosture(perf.prismaPoolPosture), "Prisma pool posture must include pgbouncer, connection_limit, and pool_timeout"],
			[hasTransactionTimeoutPosture(perf.transactionTimeoutPosture), "transaction timeout posture must include statement_timeout and idle_in_transaction_session_timeout"],
			[hasPriceHistoryBaseline(perf.priceHistoryBaseline), "PriceHistory baseline must include insert and read"],
			[hasPublicApiBaseline(perf.publicApiBaseline), "public API baseline must include search and products"],
			[hasCacheTtlBaseline(perf.cacheTtlBaseline), "cache TTL baseline must include TTL"],
		]),
	];
}

function buildEvidenceFreshnessRules(
	evidence: DirectRefreshDiscoveryPrewriteFoundationEvidence,
	now: Date,
): Rule[] {
	const generatedAt = Date.parse(evidence.generatedAt);
	if (!Number.isFinite(generatedAt)) {
		return [[false, "foundation evidence generatedAt is required"]];
	}
	const nowMs = now.getTime();
	return [
		[
			generatedAt <= nowMs &&
				nowMs - generatedAt <= FOUNDATION_EVIDENCE_MAX_AGE_MS,
			"foundation evidence must be fresh within 15 minutes",
		],
	];
}

function check(name: string, rules: Rule[]) {
	const reasons = rules.filter(([passed]) => !passed).map(([, reason]) => reason);
	return { name, status: reasons.length === 0 ? "PASS" : "FAIL", reasons };
}

function hasText(value: string | undefined) {
	return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveInteger(value: number | undefined) {
	return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function hasSafeAttemptId(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^[a-z0-9][a-z0-9._-]{2,63}$/.test(value)
	);
}

function hasWriterSupportedSource(value: string | undefined) {
	return typeof value === "string" && WRITER_SUPPORTED_SOURCES.has(value);
}

function hasFoundationArtifactPath(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^audit\/direct-refresh-discovery-prewrite-foundation\/[A-Za-z0-9._/-]+\/foundation-evidence\.json$/.test(value) &&
		!value.includes("..")
	);
}

function hasMatchingArtifactPath(
	lineagePath: string | undefined,
	evidencePath: string,
) {
	return normalizeAuditPath(lineagePath) === normalizeAuditPath(evidencePath);
}

function hasArtifactPathAttemptLineage(
	lineagePath: string | undefined,
	attemptId: string | undefined,
) {
	if (!hasSafeAttemptId(attemptId)) return false;
	return normalizeAuditPath(lineagePath).split("/").includes(attemptId ?? "");
}

function hasArtifactPathSourceCountLineage(
	lineagePath: string | undefined,
	source: string | undefined,
	count: number | undefined,
) {
	if (!hasWriterSupportedSource(source) || !hasPositiveInteger(count)) {
		return false;
	}
	const segments = normalizeAuditPath(lineagePath).split("/");
	return segments.includes(source ?? "") && segments.includes(`count${count}`);
}

function hasArtifactPathIssueLineage(
	lineagePath: string | undefined,
	issue: number | undefined,
) {
	if (!hasPositiveInteger(issue)) {
		return false;
	}
	return normalizeAuditPath(lineagePath).split("/").includes(`issue-${issue}`);
}

function hasCanonicalArtifactPathLineage(
	lineagePath: string | undefined,
	issue: number | undefined,
	source: string | undefined,
	count: number | undefined,
	attemptId: string | undefined,
) {
	if (
		!hasPositiveInteger(issue) ||
		!hasWriterSupportedSource(source) ||
		!hasPositiveInteger(count) ||
		!hasSafeAttemptId(attemptId)
	) {
		return false;
	}
	return (
		normalizeAuditPath(lineagePath) ===
		`audit/direct-refresh-discovery-prewrite-foundation/issue-${issue}/${source}/count${count}/${attemptId}/foundation-evidence.json`
	);
}

function hasMatchingArtifactSha256(
	lineageSha256: string | undefined,
	evidenceSha256: string,
) {
	return lineageSha256 === evidenceSha256;
}

function normalizeAuditPath(value: string | undefined) {
	return typeof value === "string" ? value.replaceAll("\\", "/") : "";
}

function hasExplicitEnvironmentIdentity(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^[a-z0-9][a-z0-9-]*$/.test(value) &&
		value !== "unknown"
	);
}

function hasSha256Lineage(value: string | undefined) {
	return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function hasGitCommitLineage(value: string | undefined) {
	return typeof value === "string" && /^[a-f0-9]{7,40}$/.test(value);
}

function hasToolVersionLineage(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^[a-z0-9][a-z0-9-]*@[1-9]\d*(?:\.\d+)*$/.test(value)
	);
}

function hasNumericSchemaVersion(value: string | undefined) {
	return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

function hasSourceConfigSnapshot(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^sha256:[a-f0-9]{64}; files:\S+/.test(value) &&
		hasSourceConfigSnapshotFiles(value)
	);
}

function hasMatchingSourceConfigSnapshot(
	lineageSnapshot: string | undefined,
	runtimeSha256: string,
) {
	const lineageSha256 = lineageSnapshot?.split(";")[0];
	return lineageSha256 === runtimeSha256;
}

function hasSourceConfigSnapshotFiles(value: string) {
	const files = value.split("; files:")[1]?.split(",").filter((file) => file.length > 0);
	return Array.isArray(files) && files.length > 0;
}

function hasSafeSourceConfigSnapshotFiles(value: string | undefined) {
	const files = value?.split("; files:")[1]?.split(",").filter((file) => file.length > 0);
	return (
		Array.isArray(files) &&
		files.length > 0 &&
		files.every(isSafeSourceConfigSnapshotPath)
	);
}

function hasIsoDatetime(value: string | undefined) {
	if (typeof value !== "string" || value.trim().length === 0) return false;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function hasFreshTimestamp(value: string | undefined, now: Date) {
	if (!hasIsoDatetime(value)) return false;
	const timestamp = Date.parse(value ?? "");
	const nowMs = now.getTime();
	return (
		timestamp <= nowMs && nowMs - timestamp <= FOUNDATION_EVIDENCE_MAX_AGE_MS
	);
}

function hasMatchingVtexProbeSource(
	probeSource: string | undefined,
	lineageSource: string | undefined,
) {
	return hasWriterSupportedSource(probeSource) && probeSource === lineageSource;
}

function hasVtexBackoffPolicy(value: string | undefined) {
	return hasAllTerms(value, ["timeout", "403", "429", "html", "captcha"]);
}

function hasExactRollbackIds(values: string[] | undefined) {
	return (
		Array.isArray(values) &&
		values.length > 0 &&
		values.every((value) =>
			/^(products|supermarket_products|price_history|staging_products|direct_refresh_run_ledger):[1-9]\d*$/.test(value),
		)
	);
}

function hasMinimumRollbackTableCoverage(values: string[] | undefined) {
	return (
		Array.isArray(values) &&
		values.some((value) => value.startsWith("supermarket_products:")) &&
		values.some((value) => value.startsWith("price_history:"))
	);
}

function hasRollbackTableCoverageForCount(
	values: string[] | undefined,
	count: number | undefined,
) {
	if (!Array.isArray(values) || typeof count !== "number" || count <= 0) {
		return false;
	}

	return (
		values.filter((value) => value.startsWith("supermarket_products:")).length >=
			count &&
		values.filter((value) => value.startsWith("price_history:")).length >= count
	);
}

function hasRollbackVerificationArtifact(value: string | undefined) {
	return (
		typeof value === "string" &&
		/^audit\/direct-refresh-discovery-rollback-verification\/[A-Za-z0-9._/-]+\.json$/.test(value) &&
		!value.includes("..")
	);
}

function hasPitrBackupPosture(value: string | undefined) {
	return (
		hasAnyTerm(value, ["pitr", "backup"]) &&
		hasAnyTerm(value, ["reviewed", "available"])
	);
}

function hasVtexStopRule(value: string | undefined) {
	return (
		hasAllTerms(value, ["blocked", "rate-limit", "hash_invalid"]) &&
		hasAnyTerm(value, ["no automatic retry", "no retry automatico", "no automatic retries"])
	);
}

function hasVtexHeaderPolicy(value: string | undefined) {
	return hasAllTerms(value, ["documented", "non-evasive"]);
}

function hasComplianceForSource(
	reviewedSources: string[] | undefined,
	lineageSource: string | undefined,
) {
	return (
		typeof lineageSource === "string" &&
		hasWriterSupportedSource(lineageSource) &&
		Array.isArray(reviewedSources) &&
		reviewedSources.includes(lineageSource)
	);
}

function hasActionableAlertChannel(value: string | undefined) {
	const normalized = value?.toLowerCase() ?? "";
	return (
		hasAllTerms(normalized, ["issue"]) &&
		hasAnyTerm(normalized, ["#", "slack", "email", "pagerduty"]) &&
		!normalized.includes("placeholder")
	);
}

function hasExplicitAlertOwner(value: string | undefined) {
	return hasExplicitOwner(value);
}

function hasAlertSeverity(value: string | undefined) {
	return hasAllTerms(value, ["write", "postwrite", "rollback-required"]);
}

function hasAlertAckSla(value: string | undefined) {
	return hasAllTerms(value, ["ack", "sla"]);
}

function hasAlertResolutionSla(value: string | undefined) {
	return hasAllTerms(value, ["resolution", "sla"]);
}

function hasAlertEscalationPath(value: string | undefined) {
	return hasAnyTerm(value, ["escalate", "escalation"]) && hasAnyTerm(value, ["oncall", "owner"]);
}

function hasAlertSuppressionPolicy(value: string | undefined) {
	return hasAllTerms(value, ["suppression", "noise"]);
}

function hasAlertRetryPolicy(value: string | undefined) {
	return hasAllTerms(value, ["retry", "policy"]) && hasAnyTerm(value, ["no automatic", "manual", "rollback-required"]);
}

function hasTestAlertProof(value: string | undefined) {
	return hasAllTerms(value, ["test-alert", "proof"]);
}

function hasExplicitOwner(value: string | undefined) {
	const normalized = value?.toLowerCase().trim() ?? "";
	return (
		normalized.length > 0 &&
		!["owner", "operator", "direct-refresh operator", "placeholder"].includes(normalized)
	);
}

function hasPrismaPoolPosture(value: string | undefined) {
	return hasAllTerms(value, ["pgbouncer", "connection_limit", "pool_timeout"]);
}

function hasTransactionTimeoutPosture(value: string | undefined) {
	return hasAllTerms(value, [
		"statement_timeout",
		"idle_in_transaction_session_timeout",
	]);
}

function hasPriceHistoryBaseline(value: string | undefined) {
	return hasAllTerms(value, ["pricehistory", "insert", "read"]);
}

function hasPublicApiBaseline(value: string | undefined) {
	return hasAllTerms(value, ["search", "products"]);
}

function hasCacheTtlBaseline(value: string | undefined) {
	return hasAllTerms(value, ["ttl"]);
}

function hasAllTerms(value: string | undefined, terms: string[]) {
	const normalized = value?.toLowerCase() ?? "";
	return terms.every((term) => normalized.includes(term));
}

function hasAnyTerm(value: string | undefined, terms: string[]) {
	const normalized = value?.toLowerCase() ?? "";
	return terms.some((term) => normalized.includes(term));
}
