import { readFile } from "node:fs/promises";

import {
	buildPrewriteReportHash,
	type CarrefourDirectRefreshPrewriteGate,
	type DirectRefreshPrewriteChange,
	type DirectRefreshPrewriteProductSnapshot,
	type DirectRefreshPrewriteRow,
} from "./direct-refresh-prewrite-gate";
import {
	assertDirectRefreshAllowedBatchCount,
	directRefreshConfirmationToken,
	type DirectRefreshAllowedBatchCount,
} from "./direct-refresh-batch-size";
import {
	getOptionalSingleFlag,
	parseOptionalListFlag,
	parsePositiveIntegerFlag,
} from "./audit-utils";

export const CARREFOUR_ACTIVE_WRITE_CONFIRMATION =
	directRefreshConfirmationToken("carrefour", 10);
export const VEA_ACTIVE_WRITE_CONFIRMATION = directRefreshConfirmationToken(
	"vea",
	10,
);
export const DISCO_ACTIVE_WRITE_CONFIRMATION = directRefreshConfirmationToken(
	"disco",
	10,
);
export const JUMBO_ACTIVE_WRITE_CONFIRMATION = directRefreshConfirmationToken(
	"jumbo",
	10,
);
export const MAS_ACTIVE_WRITE_CONFIRMATION = directRefreshConfirmationToken(
	"mas",
	10,
);
export const CARREFOUR_ACTIVE_WRITE_COUNT = 10;
export const VEA_ACTIVE_WRITE_COUNT = 10;
export const DISCO_ACTIVE_WRITE_COUNT = 10;
export const JUMBO_ACTIVE_WRITE_COUNT = 10;
export const MAS_ACTIVE_WRITE_COUNT = 10;
export const CARREFOUR_ACTIVE_WRITE_LOCK_KEY = 44204510;
export const VEA_ACTIVE_WRITE_LOCK_KEY = 54204510;
export const DISCO_ACTIVE_WRITE_LOCK_KEY = 61204510;
export const JUMBO_ACTIVE_WRITE_LOCK_KEY = 68204510;
export const MAS_ACTIVE_WRITE_LOCK_KEY = 75204510;
const MAX_PREWRITE_AGE_MS = 15 * 60 * 1000;

type ActiveWriteSource = "carrefour" | "vea" | "disco" | "jumbo" | "mas";
type SourceConfig = {
	source: ActiveWriteSource;
	displayName: string;
	lockKey: number;
	issue: 45 | 54 | 61 | 68 | 75;
	umbrellaIssue?: 44 | 73;
	expectedHost:
		| "carrefour.com.ar"
		| "vea.com.ar"
		| "disco.com.ar"
		| "jumbo.com.ar"
		| "masonline.com.ar";
	report: `${ActiveWriteSource}-direct-refresh-active-write`;
};
const SOURCE_CONFIGS = {
	carrefour: {
		source: "carrefour",
		displayName: "Carrefour",
		lockKey: CARREFOUR_ACTIVE_WRITE_LOCK_KEY,
		issue: 45,
		umbrellaIssue: 44,
		expectedHost: "carrefour.com.ar",
		report: "carrefour-direct-refresh-active-write",
	},
	vea: {
		source: "vea",
		displayName: "Vea",
		lockKey: VEA_ACTIVE_WRITE_LOCK_KEY,
		issue: 54,
		expectedHost: "vea.com.ar",
		report: "vea-direct-refresh-active-write",
	},
	disco: {
		source: "disco",
		displayName: "Disco",
		lockKey: DISCO_ACTIVE_WRITE_LOCK_KEY,
		issue: 61,
		expectedHost: "disco.com.ar",
		report: "disco-direct-refresh-active-write",
	},
	jumbo: {
		source: "jumbo",
		displayName: "Jumbo",
		lockKey: JUMBO_ACTIVE_WRITE_LOCK_KEY,
		issue: 68,
		expectedHost: "jumbo.com.ar",
		report: "jumbo-direct-refresh-active-write",
	},
	mas: {
		source: "mas",
		displayName: "MAS",
		lockKey: MAS_ACTIVE_WRITE_LOCK_KEY,
		issue: 75,
		umbrellaIssue: 73,
		expectedHost: "masonline.com.ar",
		report: "mas-direct-refresh-active-write",
	},
} as const satisfies Record<ActiveWriteSource, SourceConfig>;

type Counts = {
	productCount: number;
	supermarketProductCount: number;
	priceHistoryMaxId: number | null;
};
type TxRow = {
	rowId: string;
	productEan: string;
	skuId: string;
	product: DirectRefreshPrewriteProductSnapshot;
	supermarketProduct: DirectRefreshPrewriteRow["currentDb"]["supermarketProduct"];
	latestPriceHistory: DirectRefreshPrewriteRow["currentDb"]["latestPriceHistory"];
};
type AppliedRow = {
	rowId: string;
	productEan: string;
	skuId: string;
	before: DirectRefreshPrewriteRow["currentDb"];
	live: DirectRefreshPrewriteRow["live"];
	appliedChanges: {
		product: DirectRefreshPrewriteChange[];
		supermarketProduct: DirectRefreshPrewriteChange[];
	};
	insertedPriceHistoryId: number | null;
};

type ActiveWriteCliOptionsFor<Source extends ActiveWriteSource> = {
	source: Source;
	count: DirectRefreshAllowedBatchCount;
	prewriteReport: string;
	prewriteReportHash: string;
	rowIds: string[];
	productEans: string[];
	skuIds: string[];
	confirmWrite: string;
	output: string;
};
export type CarrefourActiveWriteCliOptions =
	ActiveWriteCliOptionsFor<"carrefour">;
export type VeaActiveWriteCliOptions = ActiveWriteCliOptionsFor<"vea">;
export type DiscoActiveWriteCliOptions = ActiveWriteCliOptionsFor<"disco">;
export type JumboActiveWriteCliOptions = ActiveWriteCliOptionsFor<"jumbo">;
export type MasActiveWriteCliOptions = ActiveWriteCliOptionsFor<"mas">;
export type ActiveWriteCliOptions =
	| CarrefourActiveWriteCliOptions
	| VeaActiveWriteCliOptions
	| DiscoActiveWriteCliOptions
	| JumboActiveWriteCliOptions
	| MasActiveWriteCliOptions;

export type ActiveWriteTransaction = {
	acquireAdvisoryLock(lockKey: number): Promise<boolean>;
	readNoCreateCounts(): Promise<Counts>;
	readSelectedRowsByExactIdentity(
		sourceSlug: ActiveWriteSource,
		rows: Array<{ rowId: string; productEan: string; skuId: string }>,
	): Promise<TxRow[]>;
	updateProductByEan(
		ean: string,
		changes: DirectRefreshPrewriteChange[],
	): Promise<number>;
	updateSupermarketProductByExactIdentity(
		sourceSlug: ActiveWriteSource,
		rowId: string,
		productEan: string,
		skuId: string,
		changes: DirectRefreshPrewriteChange[],
	): Promise<number>;
	insertPriceHistory(
		rowId: string,
		price: number | null,
		listPrice: number | null,
		scrapedAt: string,
	): Promise<number>;
};
export type ActiveWriteRepository = {
	withTransaction<T>(
		fn: (tx: ActiveWriteTransaction) => Promise<T>,
	): Promise<T>;
};
export type ActiveWriteReport = {
	schemaVersion: 1;
	report: `${ActiveWriteSource}-direct-refresh-active-write`;
	status: "PASS";
	issue: 45 | 54 | 61 | 68 | 75;
	umbrellaIssue?: 44 | 73;
	source: {
		slug: ActiveWriteSource;
		supermarketId: number;
		expectedHost:
			| "carrefour.com.ar"
			| "vea.com.ar"
			| "disco.com.ar"
			| "jumbo.com.ar"
			| "masonline.com.ar";
	};
	count: DirectRefreshAllowedBatchCount;
	startedAt: string;
	committedAt: string;
	confirmation: {
		prewriteReportPath: string;
		prewriteGeneratedAt: string;
		prewriteReportHash: string;
		rowIds: string[];
		productEans: string[];
		skuIds: string[];
	};
	transaction: { advisoryLockKey: number; acquired: true };
	noCreate: {
		before: Counts;
		after: Counts;
		productDelta: 0;
		supermarketProductDelta: 0;
	};
	summary: {
		rows: DirectRefreshAllowedBatchCount;
		productUpdates: number;
		supermarketProductUpdates: number;
		priceHistoryPredicted: number;
		priceHistoryInserted: number;
	};
	rollbackSnapshot: CarrefourDirectRefreshPrewriteGate["rollbackSnapshot"];
	rows: AppliedRow[];
};

const FORBIDDEN_FLAGS = [
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--purge-cache",
	"--cache-purge",
	"--cleanup",
	"--deploy",
	"--stage",
	"--staging",
	"--ingest",
	"--refresh",
	"--all-source",
	"--all-sources",
	"--dry-run",
];
const REQUIRED_FLAGS = [
	"--source",
	"--count",
	"--prewrite-report",
	"--prewrite-report-hash",
	"--row-ids",
	"--product-eans",
	"--sku-ids",
	"--confirm-write",
	"--output",
];

export function parseCarrefourActiveWriteCliOptions(
	argv = process.argv,
): CarrefourActiveWriteCliOptions {
	return parseActiveWriteCliOptions(argv, "carrefour");
}

export function parseVeaActiveWriteCliOptions(
	argv = process.argv,
): VeaActiveWriteCliOptions {
	return parseActiveWriteCliOptions(argv, "vea");
}

export function parseDiscoActiveWriteCliOptions(
	argv = process.argv,
): DiscoActiveWriteCliOptions {
	return parseActiveWriteCliOptions(argv, "disco");
}

export function parseJumboActiveWriteCliOptions(
	argv = process.argv,
): JumboActiveWriteCliOptions {
	return parseActiveWriteCliOptions(argv, "jumbo");
}

export function parseMasActiveWriteCliOptions(
	argv = process.argv,
): MasActiveWriteCliOptions {
	return parseActiveWriteCliOptions(argv, "mas");
}

function parseActiveWriteCliOptions<Source extends ActiveWriteSource>(
	argv: string[],
	expectedSource: Source,
): ActiveWriteCliOptionsFor<Source> {
	const config = SOURCE_CONFIGS[expectedSource];
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(
			`${config.displayName} active writer rejects ${foundForbidden}`,
		);
	const allowedFlags = new Set(REQUIRED_FLAGS);
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !allowedFlags.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(
			`unknown ${config.displayName} active writer flag ${unknownFlag}`,
		);
	for (const flag of REQUIRED_FLAGS) {
		const matches = argv.filter((entry) => entry.startsWith(`${flag}=`));
		if (matches.length !== 1) throw new Error(`expected exactly one ${flag}`);
	}
	const source = getOptionalSingleFlag(argv, "--source");
	if (source !== config.source)
		throw new Error(`active writer only accepts --source=${config.source}`);
	const count = assertDirectRefreshAllowedBatchCount(
		parsePositiveIntegerFlag(argv, "--count", 0),
		"active writer --count",
	);
	const hash = getOptionalSingleFlag(argv, "--prewrite-report-hash") ?? "";
	if (!/^[a-f0-9]{64}$/.test(hash))
		throw new Error("prewrite report hash must be lowercase 64 hex");
	const expectedConfirmation = directRefreshConfirmationToken(
		config.source,
		count,
	);
	const confirmWrite = getOptionalSingleFlag(argv, "--confirm-write");
	if (confirmWrite !== expectedConfirmation)
		throw new Error(
			`missing exact ${config.displayName} active write confirmation`,
		);
	return {
		source: config.source,
		count,
		prewriteReport: getOptionalSingleFlag(argv, "--prewrite-report") ?? "",
		prewriteReportHash: hash,
		rowIds: exactList(argv, "--row-ids", count),
		productEans: exactList(argv, "--product-eans", count),
		skuIds: exactList(argv, "--sku-ids", count),
		confirmWrite: expectedConfirmation,
		output: getOptionalSingleFlag(argv, "--output") ?? "",
	} as ActiveWriteCliOptionsFor<Source>;
}

export async function readPrewriteReport(path: string) {
	return JSON.parse(
		await readFile(path, "utf8"),
	) as CarrefourDirectRefreshPrewriteGate;
}

export function validatePrewriteReportForActiveWrite(
	report: CarrefourDirectRefreshPrewriteGate,
	options: ActiveWriteCliOptions,
	now = new Date(),
) {
	const config = SOURCE_CONFIGS[options.source];
	if (
		report.schemaVersion !== 1 ||
		report.audit !== `${config.source}-direct-refresh-prewrite-gate`
	)
		throw new Error("invalid prewrite report schema");
	if (
		report.status !== "PASS" ||
		report.dryRun !== true ||
		report.basis !== "production"
	)
		throw new Error("prewrite report must be PASS production dry-run");
	if (
		report.source.slug !== config.source ||
		report.source.expectedHost !== config.expectedHost ||
		report.primitive.lookupKind !== "sku-id"
	)
		throw new Error("prewrite report scope/primitive mismatch");
	if (
		report.selection.requestedSampleSize !== options.count ||
		report.selection.selectedRows !== options.count ||
		report.summary.passRows !== options.count ||
		report.summary.failRows !== 0
	)
		throw new Error(
			`prewrite report must be exactly ${options.count}/${options.count}/0`,
		);
	const ageMs = now.getTime() - new Date(report.generatedAt).getTime();
	if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_PREWRITE_AGE_MS)
		throw new Error("prewrite report is stale; maximum age is 15 minutes");
	const payload = hashPayload(report);
	const computed = buildPrewriteReportHash(payload);
	if (
		computed !== report.futureConfirmation.shape.reportHash ||
		computed !== options.prewriteReportHash
	)
		throw new Error("prewrite report hash mismatch");
	if (report.futureConfirmation.shape.source !== config.source)
		throw new Error("prewrite report confirmation source mismatch");
	assertSameList(
		"row ids",
		options.rowIds,
		report.futureConfirmation.shape.rowIds,
	);
	assertSameList(
		"product EANs",
		options.productEans,
		report.futureConfirmation.shape.productEans,
	);
	assertSameList(
		"SKU ids",
		options.skuIds,
		report.futureConfirmation.shape.skuIds,
	);
}

export function assertFreshPrewriteRerunMatches(
	input: CarrefourDirectRefreshPrewriteGate,
	rerun: CarrefourDirectRefreshPrewriteGate,
	options: ActiveWriteCliOptions,
) {
	validatePrewriteReportForActiveWrite(
		rerun,
		options,
		new Date(rerun.generatedAt),
	);
	if (
		rerun.futureConfirmation.shape.reportHash !==
		input.futureConfirmation.shape.reportHash
	)
		throw new Error("fresh prewrite rerun hash drift");
	assertSameList(
		"rerun row ids",
		rerun.futureConfirmation.shape.rowIds,
		input.futureConfirmation.shape.rowIds,
	);
	assertSameList(
		"rerun product EANs",
		rerun.futureConfirmation.shape.productEans,
		input.futureConfirmation.shape.productEans,
	);
	assertSameList(
		"rerun SKU ids",
		rerun.futureConfirmation.shape.skuIds,
		input.futureConfirmation.shape.skuIds,
	);
}

export async function executeCarrefourActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt = new Date(),
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: CarrefourActiveWriteCliOptions;
	startedAt?: Date;
}): Promise<ActiveWriteReport> {
	return executeActiveWrite({ repository, prewriteReport, options, startedAt });
}

export async function executeVeaActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt = new Date(),
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: VeaActiveWriteCliOptions;
	startedAt?: Date;
}): Promise<ActiveWriteReport> {
	return executeActiveWrite({ repository, prewriteReport, options, startedAt });
}

export async function executeDiscoActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt = new Date(),
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: DiscoActiveWriteCliOptions;
	startedAt?: Date;
}): Promise<ActiveWriteReport> {
	return executeActiveWrite({ repository, prewriteReport, options, startedAt });
}

export async function executeJumboActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt = new Date(),
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: JumboActiveWriteCliOptions;
	startedAt?: Date;
}): Promise<ActiveWriteReport> {
	return executeActiveWrite({ repository, prewriteReport, options, startedAt });
}

export async function executeMasActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt = new Date(),
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: MasActiveWriteCliOptions;
	startedAt?: Date;
}): Promise<ActiveWriteReport> {
	return executeActiveWrite({ repository, prewriteReport, options, startedAt });
}

async function executeActiveWrite({
	repository,
	prewriteReport,
	options,
	startedAt,
}: {
	repository: ActiveWriteRepository;
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: ActiveWriteCliOptions;
	startedAt: Date;
}): Promise<ActiveWriteReport> {
	const config = SOURCE_CONFIGS[options.source];
	validatePrewriteReportForActiveWrite(prewriteReport, options, startedAt);
	return repository.withTransaction(async (tx) => {
		if (!(await tx.acquireAdvisoryLock(config.lockKey)))
			throw new Error(
				`${config.displayName} active write advisory lock unavailable`,
			);
		const beforeCounts = await tx.readNoCreateCounts();
		const identities = prewriteReport.rows.map((row) => ({
			rowId: row.rowId,
			productEan: row.currentDb.supermarketProduct.productEan ?? "",
			skuId: row.lookup.value ?? "",
		}));
		const selectedRows = await tx.readSelectedRowsByExactIdentity(
			config.source,
			identities,
		);
		if (selectedRows.length !== options.count)
			throw new Error("selected rows missing before write");
		const appliedRows: AppliedRow[] = [];
		for (const row of prewriteReport.rows) {
			const productCount = await tx.updateProductByEan(
				row.currentDb.supermarketProduct.productEan ?? "",
				row.expectedChanges.product,
			);
			if (productCount !== 1)
				throw new Error(
					`product update count for ${row.rowId} was ${productCount}`,
				);
			const spCount = await tx.updateSupermarketProductByExactIdentity(
				config.source,
				row.rowId,
				row.currentDb.supermarketProduct.productEan ?? "",
				row.lookup.value ?? "",
				row.expectedChanges.supermarketProduct,
			);
			if (spCount !== 1)
				throw new Error(
					`supermarketProduct update count for ${row.rowId} was ${spCount}`,
				);
			const insertedPriceHistoryId = row.expectedChanges.priceHistory
				.wouldInsert
				? await tx.insertPriceHistory(
						row.rowId,
						row.expectedChanges.priceHistory.price,
						row.expectedChanges.priceHistory.listPrice,
						startedAt.toISOString(),
					)
				: null;
			appliedRows.push({
				rowId: row.rowId,
				productEan: row.currentDb.supermarketProduct.productEan ?? "",
				skuId: row.lookup.value ?? "",
				before: row.currentDb,
				live: row.live,
				appliedChanges: {
					product: row.expectedChanges.product,
					supermarketProduct: row.expectedChanges.supermarketProduct,
				},
				insertedPriceHistoryId,
			});
		}
		const afterCounts = await tx.readNoCreateCounts();
		if (
			afterCounts.productCount !== beforeCounts.productCount ||
			afterCounts.supermarketProductCount !==
				beforeCounts.supermarketProductCount
		)
			throw new Error("no-create assertion failed");
		return buildActiveWriteReport({
			prewriteReport,
			options,
			beforeCounts,
			afterCounts,
			rows: appliedRows,
			startedAt,
			committedAt: startedAt,
		});
	});
}

function buildActiveWriteReport({
	prewriteReport,
	options,
	beforeCounts,
	afterCounts,
	rows,
	startedAt,
	committedAt,
}: {
	prewriteReport: CarrefourDirectRefreshPrewriteGate;
	options: ActiveWriteCliOptions;
	beforeCounts: Counts;
	afterCounts: Counts;
	rows: AppliedRow[];
	startedAt: Date;
	committedAt: Date;
}): ActiveWriteReport {
	const config = SOURCE_CONFIGS[options.source];
	return {
		schemaVersion: 1,
		report: config.report,
		status: "PASS",
		issue: config.issue,
		...("umbrellaIssue" in config
			? { umbrellaIssue: config.umbrellaIssue }
			: {}),
		source: {
			slug: config.source,
			supermarketId: prewriteReport.source.supermarketId ?? 0,
			expectedHost: config.expectedHost,
		},
		count: options.count,
		startedAt: startedAt.toISOString(),
		committedAt: committedAt.toISOString(),
		confirmation: {
			prewriteReportPath: options.prewriteReport,
			prewriteGeneratedAt: prewriteReport.generatedAt,
			prewriteReportHash: options.prewriteReportHash,
			rowIds: options.rowIds,
			productEans: options.productEans,
			skuIds: options.skuIds,
		},
		transaction: {
			advisoryLockKey: config.lockKey,
			acquired: true,
		},
		noCreate: {
			before: beforeCounts,
			after: afterCounts,
			productDelta: 0,
			supermarketProductDelta: 0,
		},
		summary: {
			rows: options.count,
			productUpdates: rows.filter(
				(row) => row.appliedChanges.product.length > 0,
			).length,
			supermarketProductUpdates: rows.filter(
				(row) => row.appliedChanges.supermarketProduct.length > 0,
			).length,
			priceHistoryPredicted: prewriteReport.summary.expectedPriceHistoryInserts,
			priceHistoryInserted: rows.filter(
				(row) => row.insertedPriceHistoryId !== null,
			).length,
		},
		rollbackSnapshot: prewriteReport.rollbackSnapshot,
		rows,
	};
}

function exactList(argv: string[], flag: string, expectedCount: number) {
	const list = parseOptionalListFlag(argv, flag);
	if (list.length !== expectedCount)
		throw new Error(`${flag} must contain exactly ${expectedCount} values`);
	if (new Set(list).size !== list.length)
		throw new Error(`${flag} contains duplicate values`);
	return list;
}
function assertSameList(label: string, left: string[], right: string[]) {
	if (
		left.length !== right.length ||
		left.some((value, index) => value !== right[index])
	)
		throw new Error(`${label} confirmation mismatch`);
}
function hashPayload(report: CarrefourDirectRefreshPrewriteGate) {
	const payload: Record<string, unknown> = { ...report };
	delete payload.futureConfirmation;
	return payload;
}
