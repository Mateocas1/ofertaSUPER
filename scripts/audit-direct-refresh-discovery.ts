import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import {
	buildDirectRefreshDiscoveryAuditReport,
	type DirectRefreshDiscoveryAuditRepository,
} from "./pipeline/direct-refresh-discovery-audit";
import { stageSourceProducts } from "./pipeline/stage";

export type DirectRefreshDiscoveryAuditCliOptions = {
	source: string;
	term: string;
	count: number;
	scanCount: number;
	issue: number;
	output: string | null;
};

const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--reconcile",
	"--manifest",
	"--prewrite",
	"--postwrite",
	"--schedule",
	"--scheduler",
	"--cron",
	"--workflow",
	"--all-source",
	"--all-sources",
	"--repeat",
	"--repeated-batch",
	"--purge-cache",
	"--cache-purge",
	"--deploy",
	"--secrets",
	"--remote-config",
];
const ALLOWED_FLAGS = new Set([
	"--source",
	"--terms",
	"--count",
	"--scan-count",
	"--issue-number",
	"--output",
]);

export function parseDirectRefreshDiscoveryAuditCliOptions(
	argv = process.argv,
): DirectRefreshDiscoveryAuditCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (foundForbidden) {
		throw new Error(
			`read-only direct-refresh discovery audit rejects ${foundForbidden}`,
		);
	}
	const unknownFlag = argv
		.slice(2)
		.find(
			(entry) =>
				entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]),
		);
	if (unknownFlag)
		throw new Error(`unknown direct-refresh discovery audit flag ${unknownFlag}`);
	const bareAllowedFlag = argv
		.slice(2)
		.find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag)
		throw new Error(
			`direct-refresh discovery audit requires ${bareAllowedFlag}=...`,
		);

	const source = requiredSingleValue(argv, "--source");
	const term = requiredSingleValue(argv, "--terms");
	const count = positiveIntegerFlag(argv, "--count", 1);
	const scanCount = positiveIntegerFlag(argv, "--scan-count", count);
	const issue = positiveIntegerFlag(argv, "--issue-number", 21);
	const output = optionalSingleRawFlag(argv, "--output");
	return { source, term, count, scanCount, issue, output };
}

function readFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length).trim());
}

function requiredSingleValue(argv: string[], flagName: string) {
	const raw = optionalSingleRawFlag(argv, flagName);
	if (!raw) throw new Error(`direct-refresh discovery audit requires ${flagName}=...`);
	const values = raw
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	if (values.length !== 1) {
		throw new Error(`direct-refresh discovery audit requires exactly one ${flagName}=... value`);
	}
	return values[0];
}

function optionalSingleRawFlag(argv: string[], flagName: string) {
	const values = readFlagValues(argv, flagName);
	if (values.length > 1)
		throw new Error(`direct-refresh discovery audit accepts at most one ${flagName}=... flag`);
	return values[0] ?? null;
}

function positiveIntegerFlag(argv: string[], flagName: string, fallback: number) {
	const raw = optionalSingleRawFlag(argv, flagName);
	if (raw === null) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`direct-refresh discovery audit requires ${flagName}=... to be a positive integer`);
	}
	return parsed;
}

function createPrismaDiscoveryAuditRepository(): DirectRefreshDiscoveryAuditRepository {
	return {
		async getSourceBySlug(slug) {
			const source = await db.supermarket.findUnique({
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
			const rows = await db.product.findMany({
				where: { ean: { in: eans } },
				select: { ean: true },
			});
			return rows.map((row) => ({ ean: row.ean }));
		},
		async getSupermarketProducts(eans, supermarketId) {
			const rows = await db.supermarketProduct.findMany({
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
			const rows = await db.stagingProduct.findMany({
				where: { ean: { in: eans }, source_slug: sourceSlug, status: "PENDING" },
				select: { ean: true, source_slug: true },
			});
			return rows.map((row) => ({ ean: row.ean, sourceSlug: row.source_slug }));
		},
		async getSupermarketProductsBySourceSku(sourceSlug, skuId) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					sku_id: skuId,
					supermarket: { slug: sourceSlug },
				},
				select: { product_ean: true, supermarket_id: true, sku_id: true },
			});
			return rows.map((row) => ({
				productEan: row.product_ean,
				supermarketId: row.supermarket_id,
				skuId: row.sku_id,
			}));
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
	process.stdout.write(`Wrote direct-refresh discovery audit to ${output}\n`);
}

async function main() {
	const options = parseDirectRefreshDiscoveryAuditCliOptions();
	const report = await buildDirectRefreshDiscoveryAuditReport({
		source: options.source,
		term: options.term,
		count: options.count,
		scanCount: options.scanCount,
		issue: options.issue,
		repository: createPrismaDiscoveryAuditRepository(),
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

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
