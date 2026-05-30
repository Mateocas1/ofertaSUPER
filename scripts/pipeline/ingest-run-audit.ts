import type { CandidateAudit } from "./candidate-audit";

export type IngestRunSnapshot = CandidateAudit;

export type IngestWriteJson = {
	batchId: string;
	mode: string;
	writeMode?: string;
	dryRun: boolean;
	sourceCount: number;
	totals: {
		fetched: number;
		staged: number;
		promoted: number;
		rejected: number;
		failedSources: number;
	};
	reconciliation: {
		totalCandidates: number;
		distinctEans: number;
		newProducts: number;
		mergedProducts: number;
		supermarketProductsCreated: number;
		supermarketProductsUpdated: number;
		priceHistoryInserted: number;
		promoted: number;
		promotedByRunId: Record<string, number>;
		promotedBySource: Record<string, number>;
	} | null;
	metrics: {
		sentAlerts?: unknown[];
	} | null;
	sources: Array<{
		runId?: number | null;
		slug: string;
		candidateHash?: string | null;
		queriesSent: number;
	}>;
};

export type AuditRunRow = {
	id: number;
	batchId: string;
	sourceSlug: string;
	startedAt: string;
	status: string;
	queriesSent: number;
	productsFetched: number;
	productsStaged: number;
	productsPromoted: number;
	productsRejected: number;
	errorSummary: string | null;
};

type AuditStagingRow = {
	runId: number;
	ean: string;
	status: string;
};

type AuditProductRow = IngestRunSnapshot["snapshots"]["products"][number];
type AuditSupermarketProductRow =
	IngestRunSnapshot["snapshots"]["supermarketProducts"][number];
type AuditPriceHistoryRow =
	IngestRunSnapshot["snapshots"]["priceHistory"]["latest"][number];

export type IngestRunAuditRepository = {
	findRunById(id: number): Promise<AuditRunRow | null>;
	findRunsByBatchSourceSince(
		batchId: string,
		source: string,
		sinceIso: string,
	): Promise<AuditRunRow[]>;
	getStagingRowsForRun(runId: number): Promise<AuditStagingRow[]>;
	getCurrentProductsByEan(eans: string[]): Promise<AuditProductRow[]>;
	getCurrentSupermarketProducts(
		eans: string[],
		supermarketId: number,
	): Promise<AuditSupermarketProductRow[]>;
	getLatestPriceHistory(
		supermarketProductIds: number[],
	): Promise<AuditPriceHistoryRow[]>;
	getGlobalOrphans(): Promise<{
		runningRuns: number;
		pendingStagingRows: number;
	}>;
	getPostSnapshotPriceHistoryRows(
		supermarketProductIds: number[],
		snapshotCreatedAt: string,
	): Promise<AuditPriceHistoryRow[]>;
};

export type IngestRunAuditMode = "post-write" | "rollback";

export type IngestRunAudit = {
	status: "PASS";
	mode: IngestRunAuditMode;
	runId: number;
	source: string;
	writeMode: IngestRunSnapshot["writeMode"];
	touchedEans: string[];
	warnings: string[];
	createdRows: {
		newProducts: number;
		supermarketProductsCreated: number;
	};
};

type IngestRunAuditOptions = {
	mode: IngestRunAuditMode;
	snapshot: IngestRunSnapshot;
	writeJson: IngestWriteJson;
	repository: IngestRunAuditRepository;
};

function expectedCount(snapshot: IngestRunSnapshot) {
	return snapshot.candidateEans.length;
}

function expectedFetchedCount(snapshot: IngestRunSnapshot) {
	return snapshot.selection.mode === "existing-only"
		? snapshot.selection.scanCount
		: expectedCount(snapshot);
}

function sorted(values: string[]) {
	return [...values].sort();
}

function assertEqualStringSets(
	label: string,
	actual: string[],
	expected: string[],
) {
	assertCondition(
		JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected)),
		`${label} must match snapshot EAN set`,
	);
}

function assertCondition(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

function sourceEntry(writeJson: IngestWriteJson, source: string) {
	return writeJson.sources.find((entry) => entry.slug === source) ?? null;
}

function allowedMissingSupermarketProductEans(snapshot: IngestRunSnapshot) {
	return snapshot.allowMissingSupermarketProductEans ?? [];
}

function allowedMissingSupermarketProductSet(snapshot: IngestRunSnapshot) {
	return new Set(allowedMissingSupermarketProductEans(snapshot));
}

function assertBaselineOrAllowedMissing(
	snapshot: IngestRunSnapshot,
	ean: string,
	before: AuditSupermarketProductRow | undefined,
) {
	if (before) {
		return;
	}

	assertCondition(
		allowedMissingSupermarketProductSet(snapshot).has(ean),
		`baseline missing for ${ean}`,
	);
}

export async function resolveIngestionRun({
	snapshot,
	writeJson,
	repository,
}: Pick<IngestRunAuditOptions, "snapshot" | "writeJson" | "repository">) {
	const source = sourceEntry(writeJson, snapshot.source);
	const runId = source?.runId;

	if (typeof runId === "number") {
		return runId;
	}

	const runs = await repository.findRunsByBatchSourceSince(
		writeJson.batchId,
		snapshot.source,
		snapshot.createdAt,
	);

	assertCondition(
		runs.length === 1,
		`expected exactly one ingestion_run for batch/source/snapshot fallback; found ${runs.length}`,
	);

	return runs[0].id;
}

function assertWriteJsonShape(
	snapshot: IngestRunSnapshot,
	writeJson: IngestWriteJson,
) {
	const count = expectedCount(snapshot);
	assertCondition(
		writeJson.mode === "active",
		"write JSON mode must be active",
	);
	assertCondition(
		writeJson.writeMode === snapshot.writeMode,
		"write JSON writeMode must match snapshot",
	);
	assertCondition(
		writeJson.dryRun === false,
		"write JSON dryRun must be false",
	);
	assertCondition(
		writeJson.sourceCount === 1,
		"write JSON sourceCount must be 1",
	);
	assertCondition(
		writeJson.totals.fetched === expectedFetchedCount(snapshot),
		`write JSON totals.fetched must be ${expectedFetchedCount(snapshot)}`,
	);
	assertCondition(
		writeJson.totals.staged === count,
		`write JSON totals.staged must be ${count}`,
	);
	assertCondition(
		writeJson.totals.promoted === count,
		`write JSON totals.promoted must be ${count}`,
	);
	assertCondition(
		writeJson.totals.rejected === 0,
		"write JSON totals.rejected must be 0",
	);
	assertCondition(
		writeJson.totals.failedSources === 0,
		"write JSON totals.failedSources must be 0",
	);
	assertCondition(
		writeJson.reconciliation !== null,
		"write JSON reconciliation is required",
	);
	assertCondition(
		writeJson.reconciliation.totalCandidates === count,
		`reconciliation.totalCandidates must be ${count}`,
	);
	assertCondition(
		writeJson.reconciliation.distinctEans === count,
		`reconciliation.distinctEans must be ${count}`,
	);
	assertCondition(
		writeJson.reconciliation.newProducts === 0,
		"reconciliation.newProducts must be 0",
	);
	const expectedCreatedSupermarketProducts =
		snapshot.writeMode === "refresh-existing"
			? 0
			: allowedMissingSupermarketProductEans(snapshot).length;
	assertCondition(
		writeJson.reconciliation.supermarketProductsCreated ===
			expectedCreatedSupermarketProducts,
		`reconciliation.supermarketProductsCreated must be ${expectedCreatedSupermarketProducts}`,
	);
	assertCondition(
		writeJson.reconciliation.supermarketProductsUpdated ===
			count - expectedCreatedSupermarketProducts,
		`reconciliation.supermarketProductsUpdated must be ${count - expectedCreatedSupermarketProducts}`,
	);
	assertCondition(
		writeJson.reconciliation.promoted === count,
		`reconciliation.promoted must be ${count}`,
	);
	assertCondition(
		writeJson.reconciliation.promotedBySource[snapshot.source] === count,
		`reconciliation.promotedBySource must include source=${count}`,
	);
	assertCondition(
		(writeJson.metrics?.sentAlerts ?? []).length === 0,
		"metrics.sentAlerts must be empty",
	);
	const source = sourceEntry(writeJson, snapshot.source);
	assertCondition(source !== null, "write JSON must include snapshot source");
	assertCondition(
		source.candidateHash === snapshot.candidateHash,
		"write JSON source candidateHash must match snapshot",
	);
	assertCondition(
		source.queriesSent === 1,
		"write JSON source queriesSent must be 1",
	);
}

function assertRunRow(run: AuditRunRow, snapshot: IngestRunSnapshot) {
	const count = expectedCount(snapshot);
	assertCondition(
		run.status === "SUCCESS",
		"ingestion_run status must be SUCCESS",
	);
	assertCondition(
		run.sourceSlug === snapshot.source,
		"ingestion_run source must match snapshot",
	);
	assertCondition(
		run.queriesSent === 1,
		"ingestion_run queries_sent must be 1",
	);
	assertCondition(
		run.productsFetched === expectedFetchedCount(snapshot),
		`ingestion_run products_fetched must be ${expectedFetchedCount(snapshot)}`,
	);
	assertCondition(
		run.productsStaged === count,
		`ingestion_run products_staged must be ${count}`,
	);
	assertCondition(
		run.productsPromoted === count,
		`ingestion_run products_promoted must be ${count}`,
	);
	assertCondition(
		run.productsRejected === 0,
		"ingestion_run products_rejected must be 0",
	);
	assertCondition(
		run.errorSummary === null,
		"ingestion_run error_summary must be null",
	);
}

function assertStagingRows(
	rows: AuditStagingRow[],
	snapshot: IngestRunSnapshot,
) {
	const count = expectedCount(snapshot);
	assertCondition(rows.length === count, `staging row count must be ${count}`);
	assertEqualStringSets(
		"staging EAN set",
		rows.map((row) => row.ean),
		snapshot.candidateEans,
	);
	assertCondition(
		rows.every((row) => row.status === "PROMOTED"),
		"all staging rows must be PROMOTED",
	);
}

function candidateByEan(snapshot: IngestRunSnapshot) {
	return new Map(
		snapshot.candidates.map((candidate) => [candidate.ean, candidate]),
	);
}

function assertCurrentSupermarketProducts(
	rows: AuditSupermarketProductRow[],
	snapshot: IngestRunSnapshot,
) {
	assertCondition(
		rows.length === expectedCount(snapshot),
		"current supermarket_products set must match snapshot EAN set",
	);
	assertEqualStringSets(
		"current supermarket_products set",
		rows.map((row) => row.productEan),
		snapshot.candidateEans,
	);
	const candidates = candidateByEan(snapshot);
	const minimumLastCheckedAt = new Date(snapshot.createdAt).getTime();

	for (const row of rows) {
		const candidate = candidates.get(row.productEan);
		assertCondition(candidate, `candidate missing for ${row.productEan}`);
		assertCondition(
			row.price !== null && row.price > 0,
			`current price must be positive for ${row.productEan}`,
		);
		assertCondition(
			row.price === candidate.price,
			`current price mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.listPrice === candidate.listPrice,
			`current list_price mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.referencePrice === candidate.referencePrice,
			`current reference_price mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.referenceUnit === candidate.referenceUnit,
			`current reference_unit mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.isAvailable === candidate.isAvailable,
			`current is_available mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.skuId === candidate.skuId,
			`current sku_id mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.sellerId === candidate.sellerId,
			`current seller_id mismatch for ${row.productEan}`,
		);
		assertCondition(
			row.productUrl === candidate.productUrl,
			`current product_url mismatch for ${row.productEan}`,
		);
		assertCondition(
			Number.isFinite(new Date(row.lastCheckedAt).getTime()),
			`current last_checked_at invalid for ${row.productEan}`,
		);
		assertCondition(
			new Date(row.lastCheckedAt).getTime() >= minimumLastCheckedAt,
			`current last_checked_at must be at or after snapshot for ${row.productEan}`,
		);
	}
}

function expectedProductMetadata(snapshot: IngestRunSnapshot, ean: string) {
	const original = snapshot.snapshots.products.find(
		(product) => product.ean === ean,
	);
	const candidate = snapshot.candidates.find((entry) => entry.ean === ean);
	assertCondition(
		original && candidate,
		`product metadata source missing for ${ean}`,
	);

	return {
		name: original.name,
		brand: original.brand ?? candidate.brand,
		description: original.description ?? candidate.description,
		imageUrl: original.imageUrl ?? candidate.imageUrl,
		images: original.images.length > 0 ? original.images : candidate.images,
		category: original.category ?? candidate.category,
	};
}

function assertCurrentProducts(
	rows: AuditProductRow[],
	snapshot: IngestRunSnapshot,
) {
	assertCondition(
		rows.length === expectedCount(snapshot),
		"current products set must match snapshot EAN set",
	);
	assertEqualStringSets(
		"current products set",
		rows.map((row) => row.ean),
		snapshot.candidateEans,
	);

	for (const row of rows) {
		const expected = expectedProductMetadata(snapshot, row.ean);
		assertCondition(
			row.name === expected.name,
			`product name mismatch for ${row.ean}`,
		);
		assertCondition(
			row.brand === expected.brand,
			`product brand mismatch for ${row.ean}`,
		);
		assertCondition(
			row.description === expected.description,
			`product description mismatch for ${row.ean}`,
		);
		assertCondition(
			row.imageUrl === expected.imageUrl,
			`product imageUrl mismatch for ${row.ean}`,
		);
		assertCondition(
			JSON.stringify(row.images) === JSON.stringify(expected.images),
			`product images mismatch for ${row.ean}`,
		);
		assertCondition(
			row.category === expected.category,
			`product category mismatch for ${row.ean}`,
		);
	}
}

function snapshotSupermarketProductByEan(snapshot: IngestRunSnapshot) {
	return new Map(
		snapshot.snapshots.supermarketProducts.map((row) => [row.productEan, row]),
	);
}

function expectedHistoryRows(snapshot: IngestRunSnapshot) {
	const beforeByEan = snapshotSupermarketProductByEan(snapshot);
	const latestHistoryBySupermarketProductId = new Map(
		snapshot.snapshots.priceHistory.latest.map((row) => [
			row.supermarketProductId,
			row,
		]),
	);

	return snapshot.candidates.filter((candidate) => {
		const before = beforeByEan.get(candidate.ean);
		assertBaselineOrAllowedMissing(snapshot, candidate.ean, before);

		if (!before) {
			return true;
		}

		const latestHistory = latestHistoryBySupermarketProductId.get(before.id);
		return (
			latestHistory?.price !== candidate.price ||
			latestHistory?.listPrice !== candidate.listPrice
		);
	});
}

function assertLatestPriceHistory(
	rows: AuditPriceHistoryRow[],
	currentRows: AuditSupermarketProductRow[],
	snapshot: IngestRunSnapshot,
	writeJson: IngestWriteJson,
) {
	const changed = expectedHistoryRows(snapshot);
	assertCondition(
		writeJson.reconciliation?.priceHistoryInserted === changed.length,
		"reconciliation.priceHistoryInserted must equal expected changed-row count",
	);
	const historyBySpId = new Map(
		rows.map((row) => [row.supermarketProductId, row]),
	);

	for (const candidate of changed) {
		const current = currentRows.find((row) => row.productEan === candidate.ean);
		assertCondition(
			current,
			`current supermarket_product missing for ${candidate.ean}`,
		);
		const latest = historyBySpId.get(current.id);
		assertCondition(
			latest,
			`latest price_history missing or mismatched for ${candidate.ean}`,
		);
		assertCondition(
			latest.price === candidate.price,
			`latest price_history missing or mismatched for ${candidate.ean}`,
		);
		assertCondition(
			latest.listPrice === candidate.listPrice,
			`latest price_history missing or mismatched for ${candidate.ean}`,
		);
	}
}

function assertDeltaGates(snapshot: IngestRunSnapshot) {
	const beforeByEan = snapshotSupermarketProductByEan(snapshot);
	const warnings: string[] = [];

	for (const candidate of snapshot.candidates) {
		const before = beforeByEan.get(candidate.ean);
		assertBaselineOrAllowedMissing(snapshot, candidate.ean, before);

		if (!before) {
			assertCondition(
				candidate.price !== null && candidate.price > 0,
				`new price must be positive for ${candidate.ean}`,
			);
			continue;
		}

		assertCondition(
			before.price !== null && before.price > 0,
			`baseline price must be positive for ${candidate.ean}`,
		);
		assertCondition(
			candidate.price !== null && candidate.price > 0,
			`new price must be positive for ${candidate.ean}`,
		);
		const deltaPercent =
			(Math.abs(candidate.price - before.price) / before.price) * 100;
		assertCondition(
			deltaPercent <= 200,
			`price delta exceeds stop threshold for ${candidate.ean}`,
		);

		if (deltaPercent > 50) {
			warnings.push(
				`manual price verification required for ${candidate.ean}: delta=${deltaPercent.toFixed(2)}%`,
			);
		}
	}

	return warnings;
}

function keyedJson<T>(rows: T[], keyFn: (row: T) => string | number) {
	return JSON.stringify(
		[...rows].sort((left, right) =>
			String(keyFn(left)).localeCompare(String(keyFn(right))),
		),
	);
}

function assertRollbackRowsEqualSnapshot(
	products: AuditProductRow[],
	supermarketProducts: AuditSupermarketProductRow[],
	historyRows: AuditPriceHistoryRow[],
	snapshot: IngestRunSnapshot,
) {
	assertCondition(
		keyedJson(products, (row) => row.ean) ===
			keyedJson(snapshot.snapshots.products, (row) => row.ean),
		"rollback products must equal snapshot",
	);
	assertCondition(
		keyedJson(supermarketProducts, (row) => row.productEan) ===
			keyedJson(
				snapshot.snapshots.supermarketProducts,
				(row) => row.productEan,
			),
		"rollback supermarket_products must equal snapshot",
	);
	assertCondition(
		keyedJson(historyRows, (row) => row.supermarketProductId) ===
			keyedJson(
				snapshot.snapshots.priceHistory.latest,
				(row) => row.supermarketProductId,
			),
		"rollback latest price_history must equal snapshot",
	);
}

export async function buildIngestRunAudit({
	mode,
	snapshot,
	writeJson,
	repository,
}: IngestRunAuditOptions): Promise<IngestRunAudit> {
	const runId = await resolveIngestionRun({ snapshot, writeJson, repository });
	const [products, supermarketProducts] = await Promise.all([
		repository.getCurrentProductsByEan(snapshot.candidateEans),
		repository.getCurrentSupermarketProducts(
			snapshot.candidateEans,
			snapshot.snapshots.source.id,
		),
	]);

	if (mode === "rollback") {
		const latestHistory = await repository.getLatestPriceHistory(
			snapshot.snapshots.supermarketProducts.map((row) => row.id),
		);
		const postSnapshotHistory =
			await repository.getPostSnapshotPriceHistoryRows(
				snapshot.snapshots.supermarketProducts.map((row) => row.id),
				snapshot.createdAt,
			);
		assertCondition(
			postSnapshotHistory.length === 0,
			"rollback post-snapshot price_history rows must be removed or separately approved",
		);
		assertRollbackRowsEqualSnapshot(
			products,
			supermarketProducts,
			latestHistory,
			snapshot,
		);
		return {
			status: "PASS",
			mode,
			runId,
			source: snapshot.source,
			writeMode: snapshot.writeMode,
			touchedEans: sorted(snapshot.candidateEans),
			warnings: [],
			createdRows: { newProducts: 0, supermarketProductsCreated: 0 },
		};
	}

	assertWriteJsonShape(snapshot, writeJson);
	const run = await repository.findRunById(runId);
	assertCondition(run, `ingestion_run not found: ${runId}`);
	assertRunRow(run, snapshot);

	const [stagingRows, orphans] = await Promise.all([
		repository.getStagingRowsForRun(runId),
		repository.getGlobalOrphans(),
	]);

	assertCondition(
		orphans.runningRuns === 0,
		"global RUNNING ingestion runs must be 0",
	);
	assertCondition(
		orphans.pendingStagingRows === 0,
		"global PENDING staging rows must be 0",
	);
	assertStagingRows(stagingRows, snapshot);
	assertCurrentProducts(products, snapshot);
	assertCurrentSupermarketProducts(supermarketProducts, snapshot);
	const warnings = assertDeltaGates(snapshot);
	const latestHistory = await repository.getLatestPriceHistory(
		supermarketProducts.map((row) => row.id),
	);
	assertLatestPriceHistory(
		latestHistory,
		supermarketProducts,
		snapshot,
		writeJson,
	);

	return {
		status: "PASS",
		mode,
		runId,
		source: snapshot.source,
		writeMode: snapshot.writeMode,
		touchedEans: sorted(snapshot.candidateEans),
		warnings,
		createdRows: {
			newProducts: writeJson.reconciliation?.newProducts ?? 0,
			supermarketProductsCreated:
				writeJson.reconciliation?.supermarketProductsCreated ?? 0,
		},
	};
}
