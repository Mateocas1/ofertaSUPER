import { getOptionalSingleFlag } from "./audit-utils";
import type { DirectRefreshDiscoveryCreatePostwriteReport } from "./direct-refresh-discovery-postwrite-audit";

export type DirectRefreshDiscoveryRollbackDrillStatus = "PASS" | "FAIL";
export type DirectRefreshDiscoveryRollbackDrillArtifactRole =
	| "rollback-drill"
	| "preimage"
	| "post-rollback-verification";

export type DirectRefreshDiscoveryRollbackDrillRepository = {
	getProductsByEan(eans: string[]): Promise<Array<{ ean: string }>>;
	getSupermarketProductsByIds(ids: number[]): Promise<Array<{ id: number }>>;
	getPriceHistoryRowsByIds(ids: number[]): Promise<Array<{ id: number }>>;
	deletePriceHistoryByIds(ids: number[]): Promise<{ deletedCount: number }>;
	deleteSupermarketProductsByIds(ids: number[]): Promise<{ deletedCount: number }>;
	deleteProductsByEan(eans: string[]): Promise<{ deletedCount: number }>;
};

export type BuildDirectRefreshDiscoveryRollbackDrillOptions = {
	postwrite: DirectRefreshDiscoveryCreatePostwriteReport;
	repository: DirectRefreshDiscoveryRollbackDrillRepository;
	pitrBackupPosture: string;
	cacheHandling: string;
	now?: Date;
};
export type DirectRefreshDiscoveryRollbackDrillCliOptions = {
	mode: "mock" | "no-db";
	postwrite: string;
	outputDir: string;
};

const WRITE_BOUNDARY =
	"controlled disposable-row direct-refresh discovery rollback drill; exact rollback plan only; injected repository only; no Prisma/client/DB adapter/network/cache/PITR automation" as const;
const FORBIDDEN_FLAGS = [
	"--apply",
	"--write",
	"--confirm",
	"--execute",
	"--rollback",
	"--delete",
	"--all-source",
	"--all-sources",
	"--scheduler",
	"--purge-cache",
	"--deploy",
	"--migrations",
];
const EXPECTED_ARTIFACT_FILENAMES = {
	"rollback-drill": "rollback-drill.json",
	preimage: "preimage.json",
	"post-rollback-verification": "post-rollback-verification.json",
} as const;
const ALLOWED_FLAGS = new Set(["--mock", "--no-db", "--postwrite", "--output-dir"]);
const BROAD_ROLLBACK_PLAN_KEYS = new Set([
	"deleteAll",
	"deleteAllSources",
	"allSource",
	"allSources",
	"source",
	"sources",
	"filters",
	"where",
	"selector",
	"selectors",
]);

export function assertNoDirectRefreshDiscoveryRollbackDrillForbiddenFlags(
	argv = process.argv,
) {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`direct-refresh discovery rollback drill rejects ${foundForbidden}`,
		);
	}
}

export function parseDirectRefreshDiscoveryRollbackDrillCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryRollbackDrillCliOptions {
	assertNoDirectRefreshDiscoveryRollbackDrillForbiddenFlags(argv);

	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag) {
		throw new Error(
			`unknown direct-refresh discovery rollback drill flag ${unknownFlag}`,
		);
	}

	const bareValueFlag = argv
		.slice(2)
		.find((entry) => entry === "--postwrite" || entry === "--output-dir");
	if (bareValueFlag) {
		throw new Error(
			`direct-refresh discovery rollback drill requires ${bareValueFlag}=...`,
		);
	}

	const mock = argv.slice(2).includes("--mock");
	const noDb = argv.slice(2).includes("--no-db");
	if (!mock && !noDb) {
		throw new Error(
			"direct-refresh discovery rollback drill requires --mock or --no-db",
		);
	}
	if (mock && noDb) {
		throw new Error(
			"direct-refresh discovery rollback drill accepts only one of --mock or --no-db",
		);
	}

	const postwrite = getOptionalSingleFlag(argv, "--postwrite");
	if (!postwrite?.trim()) {
		throw new Error(
			"direct-refresh discovery rollback drill requires --postwrite=...",
		);
	}
	const outputDir = getOptionalSingleFlag(argv, "--output-dir");
	if (!outputDir?.trim()) {
		throw new Error(
			"direct-refresh discovery rollback drill requires --output-dir=...",
		);
	}

	return {
		mode: mock ? "mock" : "no-db",
		postwrite: postwrite.trim(),
		outputDir: outputDir.trim(),
	};
}

export function parseDirectRefreshDiscoveryRollbackDrillPostwriteJson(
	raw: string,
): DirectRefreshDiscoveryCreatePostwriteReport {
	return JSON.parse(raw.replace(/^\uFEFF/, "")) as DirectRefreshDiscoveryCreatePostwriteReport;
}

export function createMockDirectRefreshDiscoveryRollbackDrillRepository(
	postwrite: DirectRefreshDiscoveryCreatePostwriteReport,
): DirectRefreshDiscoveryRollbackDrillRepository {
	const rollbackPlan = postwrite.rollbackPlan;
	const products = new Set(normalizeStrings(rollbackPlan?.deleteProductEans ?? []));
	const supermarketProducts = new Set(
		normalizeNumberIds(rollbackPlan?.deleteSupermarketProductIds ?? []),
	);
	const priceHistory = new Set(
		normalizeNumberIds(rollbackPlan?.deletePriceHistoryIds ?? []),
	);

	return {
		async getProductsByEan(eans) {
			return normalizeStrings(eans)
				.filter((ean) => products.has(ean))
				.map((ean) => ({ ean }));
		},
		async getSupermarketProductsByIds(ids) {
			return normalizeNumberIds(ids)
				.filter((id) => supermarketProducts.has(id))
				.map((id) => ({ id }));
		},
		async getPriceHistoryRowsByIds(ids) {
			return normalizeNumberIds(ids)
				.filter((id) => priceHistory.has(id))
				.map((id) => ({ id }));
		},
		async deletePriceHistoryByIds(ids) {
			return { deletedCount: deleteNumberIds(priceHistory, ids) };
		},
		async deleteSupermarketProductsByIds(ids) {
			return { deletedCount: deleteNumberIds(supermarketProducts, ids) };
		},
		async deleteProductsByEan(eans) {
			let deletedCount = 0;
			for (const ean of normalizeStrings(eans)) {
				if (products.delete(ean)) deletedCount += 1;
			}
			return { deletedCount };
		},
	};
}

export function expectedDirectRefreshDiscoveryRollbackDrillArtifactFilename(
	role: DirectRefreshDiscoveryRollbackDrillArtifactRole,
) {
	return EXPECTED_ARTIFACT_FILENAMES[role];
}

export function validateDirectRefreshDiscoveryRollbackDrillArtifactPath({
	role,
	path,
}: {
	role: DirectRefreshDiscoveryRollbackDrillArtifactRole;
	path: string;
}) {
	return (
		typeof path === "string" &&
		new RegExp(
			`^audit/direct-refresh-discovery-rollback-drill/(?:[A-Za-z0-9._-]+/)*${EXPECTED_ARTIFACT_FILENAMES[role].replace(".", "\\.")}$`,
		).test(path) &&
		!path.includes("..")
	);
}

export async function buildDirectRefreshDiscoveryRollbackDrill({
	postwrite,
	repository,
	pitrBackupPosture,
	cacheHandling,
	now = new Date(),
}: BuildDirectRefreshDiscoveryRollbackDrillOptions) {
	const generatedAt = now.toISOString();
	const failClosedReasons: string[] = [];
	const rollbackPlan = postwrite.rollbackPlan;

	validatePostwriteRollbackPlan({
		postwrite,
		pitrBackupPosture,
		cacheHandling,
		failClosedReasons,
	});

	const priceHistoryIds = normalizeNumberIds(
		rollbackPlan?.deletePriceHistoryIds ?? [],
	);
	const supermarketProductIds = normalizeNumberIds(
		rollbackPlan?.deleteSupermarketProductIds ?? [],
	);
	const productEans = normalizeStrings(rollbackPlan?.deleteProductEans ?? []);

	let preimageRows = {
		products: [] as Array<{ ean: string }>,
		supermarketProducts: [] as Array<{ id: number }>,
		priceHistory: [] as Array<{ id: number }>,
	};
	let remainingRows = preimageRows;
	const deletionResults = {
		priceHistoryDeleted: 0,
		supermarketProductsDeleted: 0,
		productsDeleted: 0,
	};

	if (failClosedReasons.length === 0) {
		preimageRows = {
			products: productEans.length
				? await repository.getProductsByEan(productEans)
				: [],
			supermarketProducts: await repository.getSupermarketProductsByIds(
				supermarketProductIds,
			),
			priceHistory: await repository.getPriceHistoryRowsByIds(priceHistoryIds),
		};

		const priceHistoryDelete = await repository.deletePriceHistoryByIds(priceHistoryIds);
		deletionResults.priceHistoryDeleted = priceHistoryDelete.deletedCount;
		if (priceHistoryDelete.deletedCount !== priceHistoryIds.length) {
			failClosedReasons.push(
				`partial price_history rollback: expected ${priceHistoryIds.length}, deleted ${priceHistoryDelete.deletedCount}`,
			);
		}

		const supermarketProductDelete =
			await repository.deleteSupermarketProductsByIds(supermarketProductIds);
		deletionResults.supermarketProductsDeleted =
			supermarketProductDelete.deletedCount;
		if (supermarketProductDelete.deletedCount !== supermarketProductIds.length) {
			failClosedReasons.push(
				`partial supermarket_products rollback: expected ${supermarketProductIds.length}, deleted ${supermarketProductDelete.deletedCount}`,
			);
		}

		if (productEans.length > 0) {
			const productDelete = await repository.deleteProductsByEan(productEans);
			deletionResults.productsDeleted = productDelete.deletedCount;
			if (productDelete.deletedCount !== productEans.length) {
				failClosedReasons.push(
					`partial products rollback: expected ${productEans.length}, deleted ${productDelete.deletedCount}`,
				);
			}
		}

		remainingRows = {
			products: productEans.length
				? await repository.getProductsByEan(productEans)
				: [],
			supermarketProducts: await repository.getSupermarketProductsByIds(
				supermarketProductIds,
			),
			priceHistory: await repository.getPriceHistoryRowsByIds(priceHistoryIds),
		};

		for (const row of remainingRows.priceHistory) {
			failClosedReasons.push(`price_history rollback target still exists: ${row.id}`);
		}
		for (const row of remainingRows.supermarketProducts) {
			failClosedReasons.push(
				`supermarket_products rollback target still exists: ${row.id}`,
			);
		}
		for (const row of remainingRows.products) {
			failClosedReasons.push(`product rollback target still exists: ${row.ean}`);
		}
	}

	const sortedReasons = uniqueSorted(failClosedReasons);
	const status: DirectRefreshDiscoveryRollbackDrillStatus =
		sortedReasons.length === 0 ? "PASS" : "FAIL";
	const rollbackIds = [
		...priceHistoryIds.map((id) => `price_history:${id}`),
		...supermarketProductIds.map((id) => `supermarket_products:${id}`),
		...productEans.map((ean) => `products:${ean}`),
	];
	const evidence = { pitrBackupPosture, cacheHandling };

	return {
		schemaVersion: 1,
		audit: "direct-refresh-discovery-rollback-drill" as const,
		status,
		generatedAt,
		dryRun: false,
		writeBoundary: WRITE_BOUNDARY,
		source: postwrite.source,
		issue: postwrite.issue,
		postwriteGeneratedAt: postwrite.generatedAt,
		rollbackIds,
		evidence,
		preimage: {
			schemaVersion: 1,
			audit: "direct-refresh-discovery-rollback-drill-preimage" as const,
			status: preimageRows.priceHistory.length || preimageRows.supermarketProducts.length || preimageRows.products.length ? "PASS" as const : status,
			generatedAt,
			rollbackIds,
			rows: preimageRows,
			evidence,
		},
		postRollbackVerification: {
			schemaVersion: 1,
			audit:
				"direct-refresh-discovery-rollback-drill-post-rollback-verification" as const,
			status,
			generatedAt,
			rollbackIds,
			remainingRows,
			summary: {
				failClosedReasons: sortedReasons,
				postRollbackVerification: status === "PASS",
			},
			evidence,
		},
		deletionResults,
		summary: {
			failClosedReasons: sortedReasons,
			postRollbackVerification: status === "PASS",
		},
	};
}

function validatePostwriteRollbackPlan({
	postwrite,
	pitrBackupPosture,
	cacheHandling,
	failClosedReasons,
}: {
	postwrite: DirectRefreshDiscoveryCreatePostwriteReport;
	pitrBackupPosture: string;
	cacheHandling: string;
	failClosedReasons: string[];
}) {
	const rollbackPlan = postwrite.rollbackPlan;
	if (postwrite.status !== "PASS") {
		failClosedReasons.push("postwrite status must be PASS");
	}
	if (!rollbackPlan || typeof rollbackPlan !== "object") {
		failClosedReasons.push("rollback plan is required");
		return;
	}
	for (const key of Object.keys(rollbackPlan)) {
		if (BROAD_ROLLBACK_PLAN_KEYS.has(key)) {
			failClosedReasons.push(`broad rollback selector is forbidden: ${key}`);
		}
	}
	if (!hasPositiveIntegerIds(rollbackPlan.deletePriceHistoryIds)) {
		failClosedReasons.push("rollback plan must include exact price_history IDs");
	}
	if (!hasPositiveIntegerIds(rollbackPlan.deleteSupermarketProductIds)) {
		failClosedReasons.push(
			"rollback plan must include exact supermarket_products IDs",
		);
	}
	if (!Array.isArray(rollbackPlan.deleteProductEans)) {
		failClosedReasons.push("rollback plan product EANs must be an explicit array");
	} else if (!rollbackPlan.deleteProductEans.every(isNonEmptyString)) {
		failClosedReasons.push("rollback plan product EANs must be exact non-empty strings");
	}
	if (!isNonEmptyString(pitrBackupPosture)) {
		failClosedReasons.push("PITR/backup evidence is required");
	}
	if (!isNonEmptyString(cacheHandling)) {
		failClosedReasons.push("cache handling evidence is required");
	}
}

function hasPositiveIntegerIds(values: unknown) {
	return Array.isArray(values) && values.length > 0 && values.every(isPositiveInteger);
}

function isPositiveInteger(value: unknown) {
	return Number.isInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown) {
	return typeof value === "string" && value.trim().length > 0;
}

function normalizeNumberIds(values: number[]) {
	return Array.from(new Set(values)).sort((left, right) => left - right);
}

function normalizeStrings(values: string[]) {
	return Array.from(new Set(values.map((value) => value.trim()))).sort();
}

function deleteNumberIds(target: Set<number>, ids: number[]) {
	let deletedCount = 0;
	for (const id of normalizeNumberIds(ids)) {
		if (target.delete(id)) deletedCount += 1;
	}
	return deletedCount;
}

function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}
