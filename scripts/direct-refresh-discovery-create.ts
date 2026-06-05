import "./load-env";

import { Prisma } from "@prisma/client";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { stageSourceProducts } from "./pipeline/stage";
import {
	applyDirectRefreshDiscoveryCreatePrewrite,
	buildDirectRefreshDiscoveryCreatePrewrite,
	type DirectRefreshDiscoveryCreatePrewriteReport,
	type DirectRefreshDiscoveryCreateProductRow,
	type DirectRefreshDiscoveryCreateRepository,
	type DirectRefreshDiscoveryCreateSupermarketProductRow,
	type DirectRefreshDiscoveryCreatePriceHistoryRow,
} from "./pipeline/direct-refresh-discovery-create-gate";

export type DirectRefreshDiscoveryCreatePrewriteCliOptions = {
	source: string;
	term: string;
	count: number;
	scanCount: number;
	issue: number;
	selectedIdempotencyKeys: string[];
	output: string | null;
};

export type DirectRefreshDiscoveryCreateApplyCliOptions = {
	prewrite: string;
	confirm: string;
	output: string | null;
};

const FORBIDDEN_BROAD_FLAGS = [
	"--all-source",
	"--all-sources",
	"--repeat",
	"--repeated-batch",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--manifest",
	"--prewrite-gate",
	"--postwrite",
	"--purge-cache",
	"--cache-purge",
	"--deploy",
	"--secrets",
	"--remote-config",
];
const PREWRITE_ALLOWED_FLAGS = new Set([
	"--source",
	"--terms",
	"--count",
	"--scan-count",
	"--issue-number",
	"--selected-keys",
	"--output",
]);
const APPLY_ALLOWED_FLAGS = new Set(["--prewrite", "--confirm", "--output"]);

export function parseDirectRefreshDiscoveryCreatePrewriteCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryCreatePrewriteCliOptions {
	const args = argv.slice(3);
	assertNoForbidden(args, "read-only selection");
	assertOnlyAllowed(args, PREWRITE_ALLOWED_FLAGS);
	const source = requiredSingleValue(argv, "--source");
	const term = requiredSingleValue(argv, "--terms");
	const count = positiveIntegerFlag(argv, "--count", 1);
	const scanCount = positiveIntegerFlag(argv, "--scan-count", count);
	const issue = positiveIntegerFlag(argv, "--issue-number", 181);
	const selectedIdempotencyKeys = requiredList(argv, "--selected-keys");
	const output = optionalSingleRawFlag(argv, "--output");
	return { source, term, count, scanCount, issue, selectedIdempotencyKeys, output };
}

export function parseDirectRefreshDiscoveryCreateApplyCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryCreateApplyCliOptions {
	const args = argv.slice(3);
	assertNoForbidden(args, "direct-refresh discovery create apply");
	assertOnlyAllowed(args, APPLY_ALLOWED_FLAGS);
	return {
		prewrite: requiredRawFlag(argv, "--prewrite"),
		confirm: requiredRawFlag(argv, "--confirm"),
		output: optionalSingleRawFlag(argv, "--output"),
	};
}

function assertNoForbidden(args: string[], context: string) {
	const found = args.find((entry) =>
		FORBIDDEN_BROAD_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (found) throw new Error(`${context} rejects ${found}`);
}

function assertOnlyAllowed(args: string[], allowed: Set<string>) {
	const unknown = args.find(
		(entry) => entry.startsWith("--") && !allowed.has(entry.split("=", 1)[0]),
	);
	if (unknown) throw new Error(`unknown direct-refresh discovery create flag ${unknown}`);
	const bare = args.find((entry) => allowed.has(entry));
	if (bare) throw new Error(`direct-refresh discovery create requires ${bare}=...`);
}

function readFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length).trim());
}

function requiredSingleValue(argv: string[], flagName: string) {
	const raw = requiredRawFlag(argv, flagName);
	const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
	if (values.length !== 1) {
		throw new Error(`direct-refresh discovery create requires exactly one ${flagName}=... value`);
	}
	return values[0];
}

function requiredRawFlag(argv: string[], flagName: string) {
	const raw = optionalSingleRawFlag(argv, flagName);
	if (!raw) throw new Error(`direct-refresh discovery create requires ${flagName}=...`);
	return raw;
}

function optionalSingleRawFlag(argv: string[], flagName: string) {
	const values = readFlagValues(argv, flagName);
	if (values.length > 1)
		throw new Error(`direct-refresh discovery create accepts at most one ${flagName}=... flag`);
	return values[0] ?? null;
}

function positiveIntegerFlag(argv: string[], flagName: string, fallback: number) {
	const raw = optionalSingleRawFlag(argv, flagName);
	if (raw === null) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`direct-refresh discovery create requires ${flagName}=... to be a positive integer`);
	}
	return parsed;
}

function requiredList(argv: string[], flagName: string) {
	return requiredRawFlag(argv, flagName)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
}

function decimal(value: number | null) {
	return value === null ? null : new Prisma.Decimal(value.toFixed(2));
}

function createPrismaDiscoveryCreateRepository(
	client: typeof db | Prisma.TransactionClient = db,
): DirectRefreshDiscoveryCreateRepository {
	return {
		async getSourceBySlug(slug) {
			const source = await client.supermarket.findUnique({
				where: { slug },
				select: {
					id: true,
					slug: true,
					name: true,
					is_active: true,
					is_vtex: true,
					base_url: true,
				},
			});
			return source
				? {
						id: source.id,
						slug: source.slug,
						name: source.name,
						isActive: source.is_active,
						isVtex: source.is_vtex,
						baseUrl: source.base_url,
					}
				: null;
		},
		async getProductsByEan(eans) {
			const rows = await client.product.findMany({
				where: { ean: { in: eans } },
				select: { ean: true },
			});
			return rows.map((row) => ({ ean: row.ean }));
		},
		async getSupermarketProducts(eans, supermarketId) {
			const rows = await client.supermarketProduct.findMany({
				where: { product_ean: { in: eans }, supermarket_id: supermarketId },
				select: { product_ean: true, supermarket_id: true, sku_id: true },
			});
			return rows.map((row) => ({
				productEan: row.product_ean,
				supermarketId: row.supermarket_id,
				skuId: row.sku_id,
			}));
		},
		async getPendingStagingRowsByEan(eans, sourceSlug) {
			const rows = await client.stagingProduct.findMany({
				where: { ean: { in: eans }, source_slug: sourceSlug, status: "PENDING" },
				select: { ean: true, source_slug: true },
			});
			return rows.map((row) => ({ ean: row.ean, sourceSlug: row.source_slug }));
		},
		async getSupermarketProductsBySourceSku(sourceSlug, skuId) {
			const rows = await client.supermarketProduct.findMany({
				where: { sku_id: skuId, supermarket: { slug: sourceSlug } },
				select: { product_ean: true, supermarket_id: true, sku_id: true },
			});
			return rows.map((row) => ({
				productEan: row.product_ean,
				supermarketId: row.supermarket_id,
				skuId: row.sku_id,
			}));
		},
		async withCreateTransaction(fn) {
			return db.$transaction((tx) => fn(createPrismaDiscoveryCreateRepository(tx)), {
				maxWait: 15_000,
				timeout: 120_000,
			});
		},
		async acquireDiscoveryCreateLock(key) {
			const rows = await client.$queryRaw<Array<{ locked: boolean }>>`
				select pg_try_advisory_xact_lock(${key}) as locked
			`;
			return rows[0]?.locked === true;
		},
		async createProduct(row: DirectRefreshDiscoveryCreateProductRow) {
			await client.product.create({
				data: {
					ean: row.ean,
					name: row.name,
					brand: row.brand,
					description: row.description,
					image_url: row.imageUrl,
					images: row.images,
					category: row.category,
				},
			});
		},
		async createSupermarketProduct(row: DirectRefreshDiscoveryCreateSupermarketProductRow) {
			const created = await client.supermarketProduct.create({
				data: {
					product_ean: row.productEan,
					supermarket_id: row.supermarketId,
					price: decimal(row.price),
					list_price: decimal(row.listPrice),
					reference_price: decimal(row.referencePrice),
					reference_unit: row.referenceUnit,
					is_available: row.isAvailable,
					sku_id: row.skuId,
					seller_id: row.sellerId,
					product_url: row.productUrl,
					last_checked_at: new Date(row.lastCheckedAt),
				},
				select: { id: true },
			});
			return { id: created.id };
		},
		async createPriceHistory(row: DirectRefreshDiscoveryCreatePriceHistoryRow) {
			const created = await client.priceHistory.create({
				data: {
					supermarket_product_id: row.supermarketProductId,
					price: decimal(row.price),
					list_price: decimal(row.listPrice),
					scraped_at: new Date(row.scrapedAt),
				},
				select: { id: true },
			});
			return { id: created.id };
		},
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) {
		process.stdout.write(serialized);
		return;
	}
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh discovery create report to ${output}\n`);
}

async function readJson<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, "utf8")) as T;
}

async function runPrewrite() {
	const options = parseDirectRefreshDiscoveryCreatePrewriteCliOptions();
	const report = await buildDirectRefreshDiscoveryCreatePrewrite({
		source: options.source,
		term: options.term,
		count: options.count,
		scanCount: options.scanCount,
		issue: options.issue,
		selectedIdempotencyKeys: options.selectedIdempotencyKeys,
		repository: createPrismaDiscoveryCreateRepository(),
		fetchCandidates: async () => {
			const stage = await stageSourceProducts({
				slug: options.source,
				dryRun: true,
				queryTerms: [options.term],
				queryLimit: 1,
				count: options.scanCount,
			});
			return stage.products;
		},
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

async function runApply() {
	const options = parseDirectRefreshDiscoveryCreateApplyCliOptions();
	const prewrite = await readJson<DirectRefreshDiscoveryCreatePrewriteReport>(options.prewrite);
	const report = await applyDirectRefreshDiscoveryCreatePrewrite({
		prewrite,
		exactConfirmation: options.confirm,
		repository: createPrismaDiscoveryCreateRepository(),
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

async function main() {
	const mode = process.argv[2];
	if (mode === "prewrite") return runPrewrite();
	if (mode === "apply") return runApply();
	throw new Error("direct-refresh discovery create requires mode: prewrite or apply");
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
