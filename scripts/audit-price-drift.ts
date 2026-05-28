import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { fetchVtexProducts, probeVtexHash } from "../src/lib/vtex/client";
import {
	buildPriceDriftReport,
	type PriceDriftRepository,
} from "./pipeline/price-drift";
import {
	dateToIso,
	decimalToNumber,
	getOptionalSingleFlag,
	getRequiredSingleFlag,
	parseListFlagValue,
	parseNumberFlag,
	parseOptionalListFlag,
	parsePositiveIntegerFlag,
} from "./pipeline/audit-utils";

type CliOptions = {
	source: string;
	terms: string[];
	count: number;
	expectedEans: string[];
	warnDeltaPercent: number;
	stopDeltaPercent: number;
	output: string | null;
};

function hasFlag(argv: string[], flagName: string) {
	return argv.includes(flagName);
}

function rejectWriteFlags(argv: string[]) {
	const forbidden = [
		"--confirm-write",
		"--active",
		"--write",
		"--reconcile",
		"--purge-cache",
	];
	const found = argv.find((entry) =>
		forbidden.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);

	if (found) {
		throw new Error(`price drift audit is read-only and rejects ${found}`);
	}
}

export function parsePriceDriftCliOptions(argv = process.argv): CliOptions {
	rejectWriteFlags(argv);

	const sourceValues = parseListFlagValue(
		getRequiredSingleFlag(argv, "--source"),
	);

	if (sourceValues.length !== 1) {
		throw new Error("price drift audit requires exactly one --source value");
	}

	const terms = parseListFlagValue(getRequiredSingleFlag(argv, "--terms"));
	const count = parsePositiveIntegerFlag(argv, "--count", 5);
	const maxCount = parsePositiveIntegerFlag(argv, "--max-count", 50);

	if (count > maxCount && !hasFlag(argv, "--allow-large-count")) {
		throw new Error(
			`price drift audit refuses --count=${count} above --max-count=${maxCount} without --allow-large-count`,
		);
	}

	return {
		source: sourceValues[0],
		terms,
		count,
		expectedEans: parseOptionalListFlag(argv, "--expected-eans"),
		warnDeltaPercent: parseNumberFlag(argv, "--warn-delta-percent", 50),
		stopDeltaPercent: parseNumberFlag(argv, "--stop-delta-percent", 200),
		output: getOptionalSingleFlag(argv, "--output"),
	};
}

function createPrismaPriceDriftRepository(): PriceDriftRepository {
	return {
		async getSource(slug) {
			const row = await db.supermarket.findUnique({
				where: { slug },
				select: {
					slug: true,
					name: true,
					base_url: true,
					is_active: true,
				},
			});

			return row
				? {
						slug: row.slug,
						name: row.name,
						baseUrl: row.base_url,
						isActive: row.is_active,
					}
				: null;
		},
		async getRows(sourceSlug, eans) {
			const rows = await db.product.findMany({
				where: { ean: { in: eans } },
				select: {
					ean: true,
					name: true,
					supermarket_products: {
						where: {
							supermarket: { slug: sourceSlug },
						},
						select: {
							id: true,
							price: true,
							list_price: true,
							last_checked_at: true,
						},
						take: 1,
					},
				},
			});

			return rows.map((row) => {
				const sourceRow = row.supermarket_products[0] ?? null;

				return {
					ean: row.ean,
					productName: row.name,
					supermarketProductId: sourceRow?.id ?? null,
					price: decimalToNumber(sourceRow?.price ?? null),
					listPrice: decimalToNumber(sourceRow?.list_price ?? null),
					lastCheckedAt: dateToIso(sourceRow?.last_checked_at ?? null),
				};
			});
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
	process.stdout.write(`Wrote price drift audit to ${output}\n`);
}

async function main() {
	const options = parsePriceDriftCliOptions();
	const repository = createPrismaPriceDriftRepository();
	const source = await repository.getSource(options.source);

	if (!source?.isActive) {
		throw new Error(`unknown or inactive source: ${options.source}`);
	}

	const report = await buildPriceDriftReport({
		source: options.source,
		terms: options.terms,
		count: options.count,
		repository,
		expectedEans: options.expectedEans,
		warnDeltaPercent: options.warnDeltaPercent,
		stopDeltaPercent: options.stopDeltaPercent,
		probeHealth: async () => {
			const probe = await probeVtexHash({
				baseUrl: source.baseUrl,
				query: options.terms[0],
				count: Math.min(options.count, 5),
			});

			return {
				isHealthy: probe.isHealthy,
				hashValid: probe.hashValid,
				errorType: probe.errorType,
				responseTimeMs: probe.responseTimeMs,
				productsReturned: probe.productsReturned,
			};
		},
		fetchProducts: (term) =>
			fetchVtexProducts({
				baseUrl: source.baseUrl,
				query: term,
				count: options.count,
			}),
	});

	await writeJson(options.output, report);

	if (report.status === "FAIL") {
		process.exitCode = 1;
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
