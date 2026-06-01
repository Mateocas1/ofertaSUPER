import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import type { ActiveWriteReport } from "./pipeline/direct-refresh-active-write";
import {
	buildCarrefourDirectRefreshPostwriteAudit,
	type DirectRefreshPostwriteRepository,
} from "./pipeline/direct-refresh-postwrite-audit";
import {
	dateToIso,
	decimalToNumber,
	getRequiredSingleFlag,
} from "./pipeline/audit-utils";

type CliOptions = { writeReport: string; output: string };

const FORBIDDEN_FLAGS = [
	"--source",
	"--confirm-write",
	"--active",
	"--write",
	"--reconcile",
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
];
const REQUIRED_FLAGS = ["--write-report", "--output"];

export function parseDirectRefreshPostwriteCliOptions(
	argv = process.argv,
): CliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden)
		throw new Error(
			`direct-refresh post-write audit rejects ${foundForbidden}`,
		);
	const allowed = new Set(REQUIRED_FLAGS);
	const unknown = argv
		.slice(2)
		.find(
			(entry) => entry.startsWith("--") && !allowed.has(entry.split("=", 1)[0]),
		);
	if (unknown)
		throw new Error(`unknown direct-refresh post-write flag ${unknown}`);
	for (const flag of REQUIRED_FLAGS) {
		const matches = argv.filter((entry) => entry.startsWith(`${flag}=`));
		if (matches.length !== 1) throw new Error(`expected exactly one ${flag}`);
	}
	return {
		writeReport: getRequiredSingleFlag(argv, "--write-report"),
		output: getRequiredSingleFlag(argv, "--output"),
	};
}

export function createPostwriteRepository(): DirectRefreshPostwriteRepository {
	return {
		async readNoCreateCounts() {
			const [productCount, supermarketProductCount, maxHistory] =
				await Promise.all([
					db.product.count(),
					db.supermarketProduct.count(),
					db.priceHistory.aggregate({ _max: { id: true } }),
				]);
			return {
				productCount,
				supermarketProductCount,
				priceHistoryMaxId: maxHistory._max.id,
			};
		},
		async readSelectedRowsByExactIdentity(rows) {
			const ids = rows.map((row) => Number(row.rowId));
			const dbRows = await db.supermarketProduct.findMany({
				where: {
					id: { in: ids },
					supermarket: { slug: "carrefour" },
				},
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
					seller_id: true,
					product_url: true,
					last_checked_at: true,
					price: true,
					list_price: true,
					reference_price: true,
					reference_unit: true,
					is_available: true,
					supermarket_id: true,
					product: {
						select: {
							ean: true,
							name: true,
							brand: true,
							description: true,
							image_url: true,
							images: true,
							category: true,
						},
					},
				},
			});
			const requested = new Set(
				rows.map((row) => `${row.rowId}:${row.productEan}:${row.skuId}`),
			);
			return dbRows
				.filter((row) =>
					requested.has(`${row.id}:${row.product_ean}:${row.sku_id ?? ""}`),
				)
				.map((row) => ({
					rowId: String(row.id),
					productEan: row.product_ean,
					skuId: row.sku_id,
					product: row.product
						? {
								ean: row.product.ean,
								name: row.product.name,
								brand: row.product.brand,
								description: row.product.description,
								imageUrl: row.product.image_url,
								images: row.product.images,
								category: row.product.category,
							}
						: null,
					supermarketProduct: {
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
						productUrlHost: host(row.product_url),
						lastCheckedAt: dateToIso(row.last_checked_at),
					},
				}));
		},
		async readPriceHistoryRowsAboveId(maxId) {
			const rows = await db.priceHistory.findMany({
				where: maxId === null ? {} : { id: { gt: maxId } },
				orderBy: { id: "asc" },
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

async function readWriteReport(path: string) {
	return JSON.parse(await readFile(path, "utf8")) as ActiveWriteReport;
}
async function writeJson(output: string, report: unknown) {
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote direct-refresh post-write audit to ${output}\n`);
}
async function main() {
	const options = parseDirectRefreshPostwriteCliOptions();
	const report = await buildCarrefourDirectRefreshPostwriteAudit({
		repository: createPostwriteRepository(),
		writeReport: await readWriteReport(options.writeReport),
	});
	await writeJson(options.output, report);
	if (report.status === "FAIL") process.exitCode = 1;
}

function host(value: string | null) {
	try {
		return value
			? new URL(value).host.toLowerCase().replace(/^www\./, "")
			: null;
	} catch {
		return null;
	}
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
