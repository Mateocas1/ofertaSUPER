import type { NormalizedProduct } from "../../src/lib/vtex/normalize";

import { findDuplicates, uniqueSorted } from "./audit-utils";
import { compareExpectedEans } from "../ingest-options";

type PriceDriftSource = {
	slug: string;
	name: string;
	baseUrl: string;
	isActive: boolean;
};

export type PriceDriftDbRow = {
	ean: string;
	productName: string | null;
	supermarketProductId: number | null;
	price: number | null;
	listPrice: number | null;
	lastCheckedAt: string | null;
};

export type PriceDriftHealth = {
	isHealthy: boolean;
	hashValid: boolean;
	errorType: string | null;
	responseTimeMs: number;
	productsReturned: number;
};

export type PriceDriftRepository = {
	getSource(slug: string): Promise<PriceDriftSource | null>;
	getRows(sourceSlug: string, eans: string[]): Promise<PriceDriftDbRow[]>;
};

export type PriceDriftOptions = {
	source: string;
	terms: string[];
	count: number;
	repository: PriceDriftRepository;
	fetchProducts(term: string): Promise<NormalizedProduct[]>;
	probeHealth(): Promise<PriceDriftHealth>;
	expectedEans?: string[];
	warnDeltaPercent?: number;
	stopDeltaPercent?: number;
	now?: Date;
};

type PriceDriftStatus = "PASS" | "WARN" | "FAIL";
type PriceDriftClassification =
	| "unchanged"
	| "changed"
	| "warn"
	| "stop"
	| "missing_product"
	| "missing_source_row"
	| "invalid_live_price";

export type PriceDriftReport = {
	schemaVersion: 1;
	audit: "price-drift";
	generatedAt: string;
	source: string;
	terms: string[];
	count: number;
	thresholds: {
		warnPercent: number;
		stopPercent: number;
	};
	status: PriceDriftStatus;
	health: PriceDriftHealth;
	expectedEans: {
		provided: string[];
		actual: string[];
		ok: boolean;
		missing: string[];
		extra: string[];
		duplicateExpected: string[];
		duplicateActual: string[];
	} | null;
	summary: {
		liveProducts: number;
		matchedRows: number;
		missingProducts: number;
		missingSourceRows: number;
		invalidLivePrices: number;
		duplicateEans: string[];
		warnRows: number;
		stopRows: number;
		maxAbsDeltaPercent: number | null;
	};
	rows: Array<{
		ean: string;
		name: string;
		term: string;
		live: {
			price: number | null;
			listPrice: number | null;
		};
		db: {
			price: number | null;
			listPrice: number | null;
			lastCheckedAt: string | null;
			hasProduct: boolean;
			hasSourceRow: boolean;
		};
		drift: {
			deltaPercent: number | null;
			classification: PriceDriftClassification;
		};
		qualityFlags: string[];
	}>;
};

const MOJIBAKE_PATTERN = /Ã|Â|�/;

function positivePrice(value: number | null) {
	return value !== null && Number.isFinite(value) && value > 0;
}

function deltaPercent(live: number | null, db: number | null) {
	if (
		live === null ||
		db === null ||
		!positivePrice(live) ||
		!positivePrice(db)
	) {
		return null;
	}

	return Number((((live - db) / db) * 100).toFixed(2));
}

function classifyDelta(
	delta: number | null,
	warnDeltaPercent: number,
	stopDeltaPercent: number,
): PriceDriftClassification {
	if (delta === null) {
		return "changed";
	}

	const absDelta = Math.abs(delta);

	if (absDelta > stopDeltaPercent) {
		return "stop";
	}

	if (absDelta > warnDeltaPercent) {
		return "warn";
	}

	return absDelta === 0 ? "unchanged" : "changed";
}

function metadataQualityFlags(product: NormalizedProduct) {
	const flags: string[] = [];

	if (!positivePrice(product.price)) {
		flags.push("invalid-live-price");
	}

	for (const [field, value] of [
		["name", product.name],
		["brand", product.brand],
		["description", product.description],
		["category", product.category],
	] as const) {
		if (value && MOJIBAKE_PATTERN.test(value)) {
			flags.push(`mojibake:${field}`);
		}
	}

	if (!product.productUrl) {
		flags.push("missing-product-url");
	}

	return flags;
}

function firstByEan(products: Array<NormalizedProduct & { term: string }>) {
	const byEan = new Map<string, NormalizedProduct & { term: string }>();

	for (const product of products) {
		if (!byEan.has(product.ean)) {
			byEan.set(product.ean, product);
		}
	}

	return Array.from(byEan.values());
}

export async function buildPriceDriftReport({
	source,
	terms,
	count,
	repository,
	fetchProducts,
	probeHealth,
	expectedEans = [],
	warnDeltaPercent = 50,
	stopDeltaPercent = 200,
	now = new Date(),
}: PriceDriftOptions): Promise<PriceDriftReport> {
	if (!source || source.includes(",")) {
		throw new Error("price drift audit requires exactly one source");
	}

	if (terms.length === 0) {
		throw new Error("price drift audit requires at least one term");
	}

	if (!Number.isInteger(count) || count <= 0) {
		throw new Error("price drift audit requires a positive count");
	}

	const sourceRow = await repository.getSource(source);

	if (!sourceRow?.isActive) {
		throw new Error(`unknown or inactive source: ${source}`);
	}

	const health = await probeHealth();
	const liveByTerm = await Promise.all(
		terms.map(async (term) =>
			(await fetchProducts(term))
				.slice(0, count)
				.map((product) => ({ ...product, term })),
		),
	);
	const liveProductsWithDuplicates = liveByTerm.flat();
	const duplicateEans = findDuplicates(
		liveProductsWithDuplicates.map((product) => product.ean),
	);
	const liveProducts = firstByEan(liveProductsWithDuplicates);
	const actualEansWithDuplicates = liveProductsWithDuplicates.map(
		(product) => product.ean,
	);
	const actualEans = uniqueSorted(actualEansWithDuplicates);
	const expected =
		expectedEans.length > 0
			? compareExpectedEans(expectedEans, actualEansWithDuplicates)
			: null;
	const dbRows = await repository.getRows(source, actualEans);
	const dbByEan = new Map(dbRows.map((row) => [row.ean, row]));

	const rows = liveProducts.map((product) => {
		const db = dbByEan.get(product.ean);
		const qualityFlags = metadataQualityFlags(product);
		let classification: PriceDriftClassification;
		const delta = deltaPercent(product.price, db?.price ?? null);

		if (!positivePrice(product.price)) {
			classification = "invalid_live_price";
		} else if (!db) {
			classification = "missing_product";
		} else if (db.supermarketProductId === null) {
			classification = "missing_source_row";
		} else {
			classification = classifyDelta(delta, warnDeltaPercent, stopDeltaPercent);
		}

		return {
			ean: product.ean,
			name: product.name,
			term: product.term,
			live: {
				price: product.price,
				listPrice: product.listPrice,
			},
			db: {
				price: db?.price ?? null,
				listPrice: db?.listPrice ?? null,
				lastCheckedAt: db?.lastCheckedAt ?? null,
				hasProduct: Boolean(db),
				hasSourceRow: Boolean(db?.supermarketProductId),
			},
			drift: {
				deltaPercent: delta,
				classification,
			},
			qualityFlags,
		};
	});

	const warnRows = rows.filter(
		(row) => row.drift.classification === "warn",
	).length;
	const stopRows = rows.filter(
		(row) => row.drift.classification === "stop",
	).length;
	const missingProducts = rows.filter(
		(row) => row.drift.classification === "missing_product",
	).length;
	const missingSourceRows = rows.filter(
		(row) => row.drift.classification === "missing_source_row",
	).length;
	const invalidLivePrices = rows.filter(
		(row) => row.drift.classification === "invalid_live_price",
	).length;
	const deltas = rows
		.map((row) => row.drift.deltaPercent)
		.filter((value): value is number => value !== null);
	const maxAbsDeltaPercent =
		deltas.length > 0
			? Number(Math.max(...deltas.map((value) => Math.abs(value))).toFixed(2))
			: null;
	const status: PriceDriftStatus =
		!health.isHealthy ||
		!health.hashValid ||
		rows.length === 0 ||
		stopRows > 0 ||
		invalidLivePrices > 0 ||
		(expected && !expected.ok)
			? "FAIL"
			: warnRows > 0 ||
					missingProducts > 0 ||
					missingSourceRows > 0 ||
					duplicateEans.length > 0
				? "WARN"
				: "PASS";

	return {
		schemaVersion: 1,
		audit: "price-drift",
		generatedAt: now.toISOString(),
		source,
		terms,
		count,
		thresholds: {
			warnPercent: warnDeltaPercent,
			stopPercent: stopDeltaPercent,
		},
		status,
		health: {
			isHealthy: health.isHealthy,
			hashValid: health.hashValid,
			errorType: health.errorType,
			responseTimeMs: health.responseTimeMs,
			productsReturned: health.productsReturned,
		},
		expectedEans: expected
			? {
					provided: uniqueSorted(expectedEans),
					actual: actualEans,
					ok: expected.ok,
					missing: expected.missing,
					extra: expected.extra,
					duplicateExpected: expected.duplicateExpected,
					duplicateActual: expected.duplicateActual,
				}
			: null,
		summary: {
			liveProducts: rows.length,
			matchedRows: rows.filter((row) => row.db.hasSourceRow).length,
			missingProducts,
			missingSourceRows,
			invalidLivePrices,
			duplicateEans,
			warnRows,
			stopRows,
			maxAbsDeltaPercent,
		},
		rows,
	};
}
