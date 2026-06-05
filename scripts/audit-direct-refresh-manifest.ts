import "./load-env";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { getSourceAdapter } from "../src/lib/ingestion/adapters/registry";
import {
	buildDirectRefreshManifestDryRun,
	type DirectRefreshManifestRepository,
} from "./pipeline/direct-refresh-manifest";
import {
	dateToIso,
	decimalToNumber,
	getOptionalSingleFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type SupportedManifestSource = "carrefour" | "vea" | "disco" | "jumbo" | "mas";

type CliOptions = {
	source: SupportedManifestSource;
	sampleSize: number;
	candidateScanSize: number;
	output: string | null;
	capacityReport: string | null;
	issueNumber: number | null;
};

const DEFAULT_SOURCE = "carrefour" as const;
const SUPPORTED_SOURCES = new Set<SupportedManifestSource>([
	"carrefour",
	"vea",
	"disco",
	"jumbo",
	"mas",
]);
const FORBIDDEN_FLAGS = [
	"--confirm-write",
	"--active",
	"--write",
	"--reconcile",
	"--all-source",
	"--all-sources",
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
];

function rejectWriteFlags(argv: string[]) {
	const found = argv.find((entry) =>
		FORBIDDEN_FLAGS.some(
			(flag) => entry === flag || entry.startsWith(`${flag}=`),
		),
	);
	if (found) {
		throw new Error(
			`direct-refresh manifest audit is read-only and rejects ${found}`,
		);
	}
}

export function parseDirectRefreshManifestCliOptions(
	argv = process.argv,
): CliOptions {
	rejectWriteFlags(argv);
	const rawSource = getOptionalSingleFlag(argv, "--source") ?? DEFAULT_SOURCE;
	const sources = rawSource
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);

	if (
		sources.length !== 1 ||
		!SUPPORTED_SOURCES.has(sources[0] as SupportedManifestSource)
	) {
		throw new Error(
			"direct-refresh manifest audit only accepts --source=carrefour, --source=vea, --source=disco, --source=jumbo, or --source=mas",
		);
	}

	const sampleSize = parsePositiveIntegerFlag(argv, "--sample-size", 10);
	const candidateScanSize = parsePositiveIntegerFlag(
		argv,
		"--candidate-scan-size",
		sampleSize,
	);
	if (candidateScanSize < sampleSize)
		throw new Error("--candidate-scan-size must be >= --sample-size");
	const capacityReport = getOptionalSingleFlag(argv, "--capacity-report");
	const issueNumber = capacityReport
		? parsePositiveIntegerFlag(argv, "--issue-number", 0)
		: null;
	if (capacityReport && issueNumber === 0) {
		throw new Error("--capacity-report requires --issue-number=...");
	}
	return {
		source: sources[0] as SupportedManifestSource,
		sampleSize,
		candidateScanSize,
		output: getOptionalSingleFlag(argv, "--output"),
		capacityReport,
		issueNumber,
	};
}

function createRepository(): DirectRefreshManifestRepository {
	const mapRows = (
		rows: Array<{
			id: number;
			product_ean: string;
			sku_id: string | null;
			product_url: string | null;
			last_checked_at: Date | string | null;
			price: { toString(): string } | number | null;
			list_price: { toString(): string } | number | null;
			supermarket_id: number;
			supermarket: { slug: string };
		}>,
	) =>
		rows.map((row) => ({
			id: String(row.id),
			sourceSlug: row.supermarket.slug,
			supermarketId: row.supermarket_id,
			ean: row.product_ean,
			skuId: row.sku_id,
			productUrl: row.product_url,
			lastCheckedAt: dateToIso(row.last_checked_at),
			price: decimalToNumber(row.price),
			listPrice: decimalToNumber(row.list_price),
		}));

	return {
		async getSource(sourceSlug) {
			const source = await db.supermarket.findFirst({
				where: { slug: sourceSlug, is_active: true, is_vtex: true },
				select: { id: true, slug: true, base_url: true },
			});
			return source
				? { id: source.id, slug: source.slug, baseUrl: source.base_url }
				: null;
		},
		async listOldestPublicRankableRows(sourceSlug, sampleSize) {
			const rows = await db.supermarketProduct.findMany({
				where: {
					supermarket: { slug: sourceSlug },
					is_available: true,
					price: { gt: 0 },
					product_ean: { not: "" },
					product: { name: { not: "" } },
				},
				orderBy: { last_checked_at: "asc" },
				take: sampleSize,
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
					product_url: true,
					last_checked_at: true,
					price: true,
					list_price: true,
					supermarket_id: true,
					supermarket: { select: { slug: true } },
				},
			});
			return mapRows(rows);
		},
		async findRowsBySourceSku(sourceSlug, skuId) {
			const rows = await db.supermarketProduct.findMany({
				where: { supermarket: { slug: sourceSlug }, sku_id: skuId },
				select: {
					id: true,
					product_ean: true,
					sku_id: true,
					product_url: true,
					last_checked_at: true,
					price: true,
					list_price: true,
					supermarket_id: true,
					supermarket: { select: { slug: true } },
				},
			});
			return mapRows(rows);
		},
	};
}

async function writeJson(output: string | null, report: unknown) {
	const serialized = `${JSON.stringify(report, null, 2)}\n`;
	if (!output) return process.stdout.write(serialized);
	await mkdir(dirname(output), { recursive: true });
	await writeFile(output, serialized, "utf8");
	process.stdout.write(`Wrote direct-refresh manifest dry-run to ${output}\n`);
}

async function readCapacityEvidence(
	path: string | null,
	issueNumber: number | null,
) {
	if (!path) return null;
	const raw = await readFile(path, "utf8");
	return {
		path,
		raw,
		report: JSON.parse(raw) as unknown,
		expectedIssueNumber: issueNumber,
	};
}

async function main() {
	const options = parseDirectRefreshManifestCliOptions();
	const report = await buildDirectRefreshManifestDryRun({
		repository: createRepository(),
		sourceSlug: options.source,
		sampleSize: options.sampleSize,
		candidateScanSize: options.candidateScanSize,
		capacityEvidence: await readCapacityEvidence(
			options.capacityReport,
			options.issueNumber,
		),
		fetchDirectProducts: async (sourceSlug, lookup) =>
			getSourceAdapter(sourceSlug).fetchDirectProducts(lookup),
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
