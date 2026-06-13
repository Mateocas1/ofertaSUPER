import { getOptionalSingleFlag, uniqueSorted } from "./audit-utils";
import type { DirectRefreshDiscoveryCreatePostwriteReport } from "./direct-refresh-discovery-postwrite-audit";

export type DirectRefreshDiscoveryRollbackVerificationStatus = "PASS" | "FAIL";
export type DirectRefreshDiscoveryRollbackVerificationRepository = {
	getProductsByEan(eans: string[]): Promise<Array<{ ean: string }>>;
	getSupermarketProductsByIds(ids: number[]): Promise<Array<{ id: number }>>;
	getPriceHistoryRowsByIds(ids: number[]): Promise<Array<{ id: number }>>;
};
export type DirectRefreshDiscoveryRollbackVerificationCliOptions = {
	postwrite: string;
	output: string;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh discovery rollback verification; no deletes, no writes, no discovery apply, no scheduler/all-source/cache side effects" as const;
const FORBIDDEN_FLAGS = [
	"--delete",
	"--rollback",
	"--execute",
	"--confirm-write",
	"--active",
	"--write",
	"--apply",
	"--all-source",
	"--all-sources",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--purge-cache",
	"--cache-purge",
	"--deploy",
	"--secrets",
	"--remote-config",
];
const ALLOWED_FLAGS = new Set(["--postwrite", "--output"]);

export function parseDirectRefreshDiscoveryRollbackVerificationCliOptions(
	argv = process.argv,
	now = new Date(),
): DirectRefreshDiscoveryRollbackVerificationCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(
			`direct-refresh discovery rollback verification rejects ${foundForbidden}`,
		);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(
			`unknown direct-refresh discovery rollback verification flag ${unknownFlag}`,
		);
	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(
			`direct-refresh discovery rollback verification requires ${bareAllowedFlag}=...`,
		);
	const postwrite = getOptionalSingleFlag(argv, "--postwrite");
	if (!postwrite)
		throw new Error(
			"direct-refresh discovery rollback verification requires --postwrite=...",
		);
	return {
		postwrite,
		output:
			getOptionalSingleFlag(argv, "--output") ??
			`audit/direct-refresh-discovery-rollback-verification/${now.toISOString().replaceAll(":", "-")}/rollback-verification.json`,
	};
}

export function parseDirectRefreshDiscoveryRollbackVerificationPostwriteJson(
	raw: string,
): DirectRefreshDiscoveryCreatePostwriteReport {
	return JSON.parse(raw.replace(/^\uFEFF/, "")) as DirectRefreshDiscoveryCreatePostwriteReport;
}

export async function buildDirectRefreshDiscoveryRollbackVerification({
	postwrite,
	repository,
	now = new Date(),
}: {
	postwrite: DirectRefreshDiscoveryCreatePostwriteReport;
	repository: DirectRefreshDiscoveryRollbackVerificationRepository;
	now?: Date;
}) {
	const failClosedReasons: string[] = [];
	const rollbackPlan = postwrite.rollbackPlan;
	const productEans = uniqueSorted(rollbackPlan.deleteProductEans);
	const supermarketProductIds = uniqueSorted(
		rollbackPlan.deleteSupermarketProductIds.map(String),
	).map(Number);
	const priceHistoryIds = uniqueSorted(
		rollbackPlan.deletePriceHistoryIds.map(String),
	).map(Number);

	if (postwrite.status !== "PASS") {
		failClosedReasons.push("postwrite status must be PASS");
	}
	if (
		productEans.length === 0 &&
		supermarketProductIds.length === 0 &&
		priceHistoryIds.length === 0
	) {
		failClosedReasons.push("rollback plan must include exact IDs or EANs");
	}

	const [products, supermarketProducts, priceHistory] = await Promise.all([
		productEans.length ? repository.getProductsByEan(productEans) : [],
		supermarketProductIds.length
			? repository.getSupermarketProductsByIds(supermarketProductIds)
			: [],
		priceHistoryIds.length ? repository.getPriceHistoryRowsByIds(priceHistoryIds) : [],
	]);

	for (const row of products) {
		failClosedReasons.push(`product rollback target still exists: ${row.ean}`);
	}
	for (const row of supermarketProducts) {
		failClosedReasons.push(`supermarket_products rollback target still exists: ${row.id}`);
	}
	for (const row of priceHistory) {
		failClosedReasons.push(`price_history rollback target still exists: ${row.id}`);
	}

	const sortedReasons = uniqueSorted(failClosedReasons);
	const status: DirectRefreshDiscoveryRollbackVerificationStatus =
		sortedReasons.length === 0 ? "PASS" : "FAIL";
	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-rollback-verification" as const,
		status,
		generatedAt: now.toISOString(),
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		source: postwrite.source,
		issue: postwrite.issue,
		postwriteGeneratedAt: postwrite.generatedAt,
		rollbackIds: [
			...priceHistoryIds.map((id) => `price_history:${id}`),
			...supermarketProductIds.map((id) => `supermarket_products:${id}`),
			...productEans.map((ean) => `products:${ean}`),
		],
		remainingRows: {
			products,
			supermarketProducts,
			priceHistory,
		},
		summary: {
			failClosedReasons: sortedReasons,
			postRollbackVerification: status === "PASS",
		},
	};
}
