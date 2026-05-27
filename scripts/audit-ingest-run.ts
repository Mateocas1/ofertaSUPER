import "./load-env";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { db } from "../src/lib/db";
import {
	buildIngestRunAudit,
	type AuditRunRow,
	type IngestRunAuditMode,
	type IngestRunAuditRepository,
	type IngestRunSnapshot,
	type IngestWriteJson,
} from "./pipeline/ingest-run-audit";

type CliOptions = {
	mode: IngestRunAuditMode;
	snapshotPath: string;
	writeJsonPath: string;
	outputPath: string | null;
	runId: number | null;
};

function readFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length));
}

function readRequiredFlag(argv: string[], flagName: string) {
	const values = readFlagValues(argv, flagName);

	if (values.length !== 1 || values[0].trim().length === 0) {
		throw new Error(
			`ingest run audit requires exactly one ${flagName}=... flag`,
		);
	}

	return values[0].trim();
}

function readOptionalFlag(argv: string[], flagName: string) {
	const values = readFlagValues(argv, flagName);

	if (values.length > 1) {
		throw new Error(
			`ingest run audit accepts at most one ${flagName}=... flag`,
		);
	}

	return values[0]?.trim() || null;
}

function parseMode(value: string | null): IngestRunAuditMode {
	if (value === null || value === "post-write") {
		return "post-write";
	}

	if (value === "rollback") {
		return "rollback";
	}

	throw new Error("ingest run audit --mode must be post-write or rollback");
}

function parseOptionalRunId(value: string | null) {
	if (value === null) {
		return null;
	}

	const parsed = Number(value);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error("ingest run audit --run-id must be a positive integer");
	}

	return parsed;
}

function parseCliOptions(argv = process.argv): CliOptions {
	return {
		mode: parseMode(readOptionalFlag(argv, "--mode")),
		snapshotPath: readRequiredFlag(argv, "--snapshot"),
		writeJsonPath: readRequiredFlag(argv, "--write-json"),
		outputPath: readOptionalFlag(argv, "--output"),
		runId: parseOptionalRunId(readOptionalFlag(argv, "--run-id")),
	};
}

async function readJsonFile<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

function decimalToNumber(value: { toString(): string } | number | null) {
	if (value === null) {
		return null;
	}

	const numeric = Number(value.toString());
	return Number.isFinite(numeric) ? numeric : null;
}

function dateToIso(value: Date | string) {
	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

function mapRun(row: {
	id: number;
	batch_id: string;
	source_slug: string;
	started_at: Date;
	status: string;
	queries_sent: number;
	products_fetched: number;
	products_staged: number;
	products_promoted: number;
	products_rejected: number;
	error_summary: string | null;
}): AuditRunRow {
	return {
		id: row.id,
		batchId: row.batch_id,
		sourceSlug: row.source_slug,
		startedAt: dateToIso(row.started_at),
		status: row.status,
		queriesSent: row.queries_sent,
		productsFetched: row.products_fetched,
		productsStaged: row.products_staged,
		productsPromoted: row.products_promoted,
		productsRejected: row.products_rejected,
		errorSummary: row.error_summary,
	};
}

async function getActiveSourceSlugs() {
	const sources = await db.supermarket.findMany({
		where: { is_active: true, is_vtex: true },
		select: { slug: true },
	});

	return sources.map((source) => source.slug);
}

function createPrismaIngestRunAuditRepository(): IngestRunAuditRepository {
	return {
		async findRunById(id) {
			const row = await db.ingestionRun.findUnique({
				where: { id },
				select: {
					id: true,
					batch_id: true,
					source_slug: true,
					started_at: true,
					status: true,
					queries_sent: true,
					products_fetched: true,
					products_staged: true,
					products_promoted: true,
					products_rejected: true,
					error_summary: true,
				},
			});

			return row ? mapRun(row) : null;
		},
		async findRunsByBatchSourceSince(batchId, source, sinceIso) {
			const rows = await db.ingestionRun.findMany({
				where: {
					batch_id: batchId,
					source_slug: source,
					started_at: { gte: new Date(sinceIso) },
				},
				orderBy: { id: "asc" },
				select: {
					id: true,
					batch_id: true,
					source_slug: true,
					started_at: true,
					status: true,
					queries_sent: true,
					products_fetched: true,
					products_staged: true,
					products_promoted: true,
					products_rejected: true,
					error_summary: true,
				},
			});

			return rows.map(mapRun);
		},
		async getStagingRowsForRun(runId) {
			const rows = await db.stagingProduct.findMany({
				where: { run_id: runId },
				select: { run_id: true, ean: true, status: true },
			});

			return rows.map((row) => ({
				runId: row.run_id,
				ean: row.ean,
				status: row.status,
			}));
		},
		async getCurrentProductsByEan(eans) {
			const rows = await db.product.findMany({
				where: { ean: { in: eans } },
				select: {
					ean: true,
					name: true,
					brand: true,
					description: true,
					image_url: true,
					images: true,
					category: true,
				},
			});

			return rows.map((row) => ({
				ean: row.ean,
				name: row.name,
				brand: row.brand,
				description: row.description,
				imageUrl: row.image_url,
				images: row.images,
				category: row.category,
			}));
		},
		async getCurrentSupermarketProducts(eans, supermarketId) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					product_ean: { in: eans },
					supermarket_id: supermarketId,
				},
				select: {
					id: true,
					product_ean: true,
					supermarket_id: true,
					price: true,
					list_price: true,
					reference_price: true,
					reference_unit: true,
					is_available: true,
					sku_id: true,
					seller_id: true,
					product_url: true,
					last_checked_at: true,
				},
			});

			return rows.map((row) => ({
				id: row.id,
				productEan: row.product_ean,
				supermarketId: row.supermarket_id,
				price: decimalToNumber(row.price),
				listPrice: decimalToNumber(row.list_price),
				referencePrice: decimalToNumber(row.reference_price),
				referenceUnit: row.reference_unit,
				isAvailable: row.is_available,
				skuId: row.sku_id,
				sellerId: row.seller_id,
				productUrl: row.product_url,
				lastCheckedAt: dateToIso(row.last_checked_at),
			}));
		},
		async getLatestPriceHistory(supermarketProductIds) {
			if (supermarketProductIds.length === 0) {
				return [];
			}

			const rows = await db.priceHistory.findMany({
				where: { supermarket_product_id: { in: supermarketProductIds } },
				orderBy: [{ supermarket_product_id: "asc" }, { scraped_at: "desc" }],
				distinct: ["supermarket_product_id"],
				select: {
					id: true,
					supermarket_product_id: true,
					price: true,
					list_price: true,
					scraped_at: true,
				},
			});

			return rows.map((row) => ({
				id: row.id,
				supermarketProductId: row.supermarket_product_id,
				price: decimalToNumber(row.price),
				listPrice: decimalToNumber(row.list_price),
				scrapedAt: dateToIso(row.scraped_at),
			}));
		},
		async getGlobalOrphans() {
			const activeSlugs = await getActiveSourceSlugs();
			const [runningRuns, pendingStagingRows] = await Promise.all([
				db.ingestionRun.count({
					where: { source_slug: { in: activeSlugs }, status: "RUNNING" },
				}),
				db.stagingProduct.count({
					where: { source_slug: { in: activeSlugs }, status: "PENDING" },
				}),
			]);

			return { runningRuns, pendingStagingRows };
		},
		async getPostSnapshotPriceHistoryRows(
			supermarketProductIds,
			snapshotCreatedAt,
		) {
			if (supermarketProductIds.length === 0) {
				return [];
			}

			const rows = await db.priceHistory.findMany({
				where: {
					supermarket_product_id: { in: supermarketProductIds },
					scraped_at: { gte: new Date(snapshotCreatedAt) },
				},
				select: {
					id: true,
					supermarket_product_id: true,
					price: true,
					list_price: true,
					scraped_at: true,
				},
			});

			return rows.map((row) => ({
				id: row.id,
				supermarketProductId: row.supermarket_product_id,
				price: decimalToNumber(row.price),
				listPrice: decimalToNumber(row.list_price),
				scrapedAt: dateToIso(row.scraped_at),
			}));
		},
	};
}

async function writeJson(path: string | null, value: unknown) {
	const json = `${JSON.stringify(value, null, 2)}\n`;

	if (!path) {
		console.log(json);
		return;
	}

	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, json, "utf8");
	console.log(`Ingest run audit written to ${path}`);
}

function injectRunId(
	writeJson: IngestWriteJson,
	snapshot: IngestRunSnapshot,
	runId: number | null,
) {
	if (runId === null) {
		return writeJson;
	}

	return {
		...writeJson,
		sources: writeJson.sources.map((source) =>
			source.slug === snapshot.source ? { ...source, runId } : source,
		),
	};
}

async function main() {
	const options = parseCliOptions();
	const snapshot = await readJsonFile<IngestRunSnapshot>(options.snapshotPath);
	const writeJson = injectRunId(
		await readJsonFile<IngestWriteJson>(options.writeJsonPath),
		snapshot,
		options.runId,
	);
	const audit = await buildIngestRunAudit({
		mode: options.mode,
		snapshot,
		writeJson,
		repository: createPrismaIngestRunAuditRepository(),
	});

	await writeJsonFile(options.outputPath, audit);
}

async function writeJsonFile(path: string | null, value: unknown) {
	await writeJson(path, value);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
