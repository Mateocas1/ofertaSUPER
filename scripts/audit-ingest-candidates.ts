import "./load-env";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { db } from "../src/lib/db";
import {
	buildCandidateAudit,
	isCandidateAuditError,
	type CandidateAuditRepository,
	type CandidateSelectionMode,
	type MojibakeWaiver,
} from "./pipeline/candidate-audit";
import type { CandidateWriteMode } from "./pipeline/candidate-snapshot";
import { stageSourceProducts } from "./pipeline/stage";

type CliOptions = {
	source: string;
	term: string;
	count: number;
	queryLimit: number;
	writeMode: CandidateWriteMode;
	candidateSelection: CandidateSelectionMode;
	scanCount: number;
	output: string | null;
	mojibakeWaivers: MojibakeWaiver[];
	allowMissingSupermarketProductEans: string[];
};

function readFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length));
}

function readRequiredSingleListFlag(argv: string[], flagName: string) {
	const rawValues = readFlagValues(argv, flagName);

	if (rawValues.length !== 1) {
		throw new Error(
			`candidate audit requires exactly one ${flagName}=... flag`,
		);
	}

	const values = rawValues[0]
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);

	if (values.length !== 1) {
		throw new Error(
			`candidate audit requires exactly one ${flagName}=... value`,
		);
	}

	return values[0];
}

function readOptionalSingleFlagValue(argv: string[], flagName: string) {
	const rawValues = readFlagValues(argv, flagName);

	if (rawValues.length > 1) {
		throw new Error(`candidate audit accepts at most one ${flagName}=... flag`);
	}

	return rawValues[0] ?? null;
}

function readOptionalListFlags(argv: string[], flagName: string) {
	return readFlagValues(argv, flagName).flatMap((rawValue) =>
		rawValue
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean),
	);
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
		throw new Error(`candidate audit is read-only and rejects ${found}`);
	}
}

function readPositiveIntegerFlag(
	argv: string[],
	flagName: string,
	fallback: number,
) {
	const raw = readOptionalSingleFlagValue(argv, flagName);

	if (raw === null) {
		return fallback;
	}

	const parsed = Number(raw);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(
			`candidate audit requires ${flagName} to be a positive integer`,
		);
	}

	return parsed;
}

function parseWriteMode(argv: string[]): CandidateWriteMode {
	const raw =
		readOptionalSingleFlagValue(argv, "--write-mode") ?? "phase4-count5";

	if (raw === "phase4-count5" || raw === "refresh-existing") {
		return raw;
	}

	throw new Error(
		"candidate audit requires --write-mode=phase4-count5 or --write-mode=refresh-existing",
	);
}

function parseMojibakeWaivers(rawValues: string[] | null): MojibakeWaiver[] {
	if (!rawValues) {
		return [];
	}

	return rawValues.map((rawValue) => {
		const [ean, field, ...reasonParts] = rawValue
			.split(":")
			.map((value) => value.trim());
		const reason = reasonParts.join(":").trim();

		if (!ean || !field || !reason) {
			throw new Error(
				"--allow-mojibake-waiver entries must use ean:field:reason",
			);
		}

		return { ean, field, reason };
	});
}

function parseCandidateSelectionMode(argv: string[]): CandidateSelectionMode {
	const raw =
		readOptionalSingleFlagValue(argv, "--candidate-selection") ?? "strict";

	if (raw === "strict" || raw === "existing-only") {
		return raw;
	}

	throw new Error(
		"candidate audit requires --candidate-selection=strict or --candidate-selection=existing-only",
	);
}

function parseCliOptions(argv = process.argv): CliOptions {
	rejectWriteFlags(argv);
	const source = readRequiredSingleListFlag(argv, "--source");
	const term = readRequiredSingleListFlag(argv, "--terms");
	const count = readPositiveIntegerFlag(argv, "--count", 5);
	const queryLimit = readPositiveIntegerFlag(argv, "--limit", 1);
	const writeMode = parseWriteMode(argv);
	const candidateSelection = parseCandidateSelectionMode(argv);
	const scanCount = readPositiveIntegerFlag(argv, "--scan-count", count);
	const output = readOptionalSingleFlagValue(argv, "--output");
	const mojibakeWaivers = parseMojibakeWaivers(
		readOptionalListFlags(argv, "--allow-mojibake-waiver"),
	);
	const allowMissingSupermarketProductEans = readOptionalListFlags(
		argv,
		"--allow-missing-supermarket-product-eans",
	);

	if (writeMode === "phase4-count5" && count !== 5) {
		throw new Error("candidate audit requires --count=5");
	}

	if (writeMode === "refresh-existing" && count > 25) {
		throw new Error(
			"candidate audit refresh-existing count must be at most 25",
		);
	}

	if (queryLimit !== 1) {
		throw new Error("candidate audit requires --limit=1");
	}

	if (candidateSelection === "existing-only" && writeMode !== "refresh-existing") {
		throw new Error(
			"candidate audit existing-only selection requires --write-mode=refresh-existing",
		);
	}

	return {
		source,
		term,
		count,
		queryLimit,
		writeMode,
		candidateSelection,
		scanCount,
		output,
		mojibakeWaivers,
		allowMissingSupermarketProductEans,
	};
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

function createPrismaCandidateAuditRepository(): CandidateAuditRepository {
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
				},
			});

			return source
				? {
						id: source.id,
						slug: source.slug,
						name: source.name,
						isActive: source.is_active,
						isVtex: source.is_vtex,
					}
				: null;
		},
		async getProductsByEan(eans) {
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
		async getSupermarketProducts(eans, supermarketId) {
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
		async getMaxPriceHistoryId() {
			const aggregate = await db.priceHistory.aggregate({
				_max: { id: true },
			});

			return aggregate._max.id ?? null;
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
	console.log(`Candidate audit written to ${path}`);
}

async function main() {
	const options = parseCliOptions();

	try {
		const audit = await buildCandidateAudit({
			source: options.source,
			term: options.term,
			count: options.count,
			queryLimit: options.queryLimit,
			mojibakeWaivers: options.mojibakeWaivers,
			allowMissingSupermarketProductEans:
				options.allowMissingSupermarketProductEans,
			writeMode: options.writeMode,
			selectionMode: options.candidateSelection,
			scanCount: options.scanCount,
			repository: createPrismaCandidateAuditRepository(),
			fetchCandidates: async () => {
				const stage = await stageSourceProducts({
					slug: options.source,
					dryRun: true,
					queryTerms: [options.term],
					queryLimit: options.queryLimit,
					count: options.scanCount,
				});

				if (stage.queriesSent !== 1) {
					throw new Error(
						`candidate audit expected one VTEX query; got ${stage.queriesSent}`,
					);
				}

				return stage.products;
			},
		});

		await writeJson(options.output, audit);
	} catch (error) {
		if (options.output && isCandidateAuditError(error)) {
			await writeJson(options.output, error.report);
		}

		throw error;
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
