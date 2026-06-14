import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeProduct } from "@/lib/vtex/normalize";

import {
	buildCategoryPaginationAuditReport,
	categoryPaginationOutputBoundary,
	filterCategoryPaginationAuditCategories,
	getCategoryPaginationSourceConfig,
	normalizeCategoryPaginationOutputPath,
	offsetCategoryPaginationAuditCategories,
	parseCategoryPaginationCliOptions,
	selectCategoryPaginationAuditCategories,
	type CategoryPaginationCategory,
	type CategoryPaginationFetchError,
	type CategoryPaginationPageResult,
	type CategoryPaginationProduct,
	type CategoryPaginationSource,
} from "./pipeline/category-pagination-audit";

export { parseCategoryPaginationCliOptions } from "./pipeline/category-pagination-audit";

type RawCategory = {
	id?: unknown;
	Id?: unknown;
	name?: unknown;
	Name?: unknown;
	url?: unknown;
	Url?: unknown;
	children?: unknown;
	Children?: unknown;
};

const CATEGORY_TREE_PATH = "/api/catalog_system/pub/category/tree/3";

export async function writeCategoryPaginationAuditJson(output: string, report: unknown, issue = 263, source: CategoryPaginationSource = "vea") {
	const safeOutput = normalizeCategoryPaginationOutputPath(output, categoryPaginationOutputBoundary({
		issue,
		source,
		surface: "category-pagination",
	}));
	await mkdir(dirname(safeOutput), { recursive: true });
	await writeFile(safeOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	process.stdout.write(`Wrote ${source} category pagination audit artifact to ${safeOutput}\n`);
}

async function main() {
	const options = parseCategoryPaginationCliOptions();
	const sourceConfig = getCategoryPaginationSourceConfig(options.source);
	const generatedAt = new Date(options.generatedAt ?? Date.now());
	const { categories, status: categoryTreeStatus, errors } = await fetchCategories(sourceConfig.baseUrl, options.timeoutMs);
	const categoryFilter = filterCategoryPaginationAuditCategories(categories, options.excludeCategoryPathPattern);
	const categorySampling = offsetCategoryPaginationAuditCategories(categoryFilter.categories, options.categoryOffset);
	const selectedCategories = selectCategoryPaginationAuditCategories(categorySampling.categories, options.categoryBudget);
	const pages: CategoryPaginationPageResult[] = [];

	for (const category of selectedCategories) {
		for (let page = 0; page < options.pageBudget; page += 1) {
			if (1 + pages.length + errors.length >= options.requestBudget) {
				errors.push({ category, page, endpoint: productEndpoint(sourceConfig.baseUrl, category, page, options.pageSize), reason: `request budget reached before page fetch: limit ${options.requestBudget}` });
				break;
			}
			const result = await fetchCategoryPage(sourceConfig.baseUrl, category, page, options.pageSize, options.timeoutMs);
			if ("reason" in result) {
				errors.push(result);
				break;
			}
			pages.push(result);
			if (result.products.length < options.pageSize) break;
		}
	}

	const report = buildCategoryPaginationAuditReport({
		generatedAt,
		source: options.source,
		issue: options.issue,
		outputPath: options.output,
		requestBudget: options.requestBudget,
		categoryBudget: options.categoryBudget,
		pageBudget: options.pageBudget,
		pageSize: options.pageSize,
		timeoutMs: options.timeoutMs,
		categories,
		categoryTreeStatus,
		pages,
		errors,
		excludeCategoryPathPattern: options.excludeCategoryPathPattern,
		excludedCategoryPathCount: categoryFilter.excludedCount,
		categoryOffset: options.categoryOffset,
		skippedEligibleCategoryPathCount: categorySampling.skippedCount,
	});
	await writeCategoryPaginationAuditJson(options.output, report, options.issue, options.source);
	if (report.confidence.status === "FAIL") process.exitCode = 1;
}

async function fetchCategories(baseUrl: string, timeoutMs: number) {
	const endpoint = new URL(CATEGORY_TREE_PATH, baseUrl).toString();
	try {
		const { payload, status } = await getJson(endpoint, timeoutMs);
		return { categories: flattenCategories(payload, baseUrl), status, errors: [] as CategoryPaginationFetchError[] };
	} catch (error) {
		return { categories: [], status: null, errors: [{ endpoint, reason: errorMessage(error) }] };
	}
}

async function fetchCategoryPage(
	baseUrl: string,
	category: CategoryPaginationCategory,
	page: number,
	pageSize: number,
	timeoutMs: number,
): Promise<CategoryPaginationPageResult | CategoryPaginationFetchError> {
	const endpoint = productEndpoint(baseUrl, category, page, pageSize);
	try {
		const { payload, status, contentRange } = await getJson(endpoint, timeoutMs);
		const rows = Array.isArray(payload) ? payload : [];
		return {
			category,
			page,
			from: page * pageSize,
			to: page * pageSize + pageSize - 1,
			endpoint,
			status,
			contentRange,
			products: rows.map((row) => toAuditProduct(row, baseUrl)).filter((product): product is CategoryPaginationProduct => Boolean(product)),
		};
	} catch (error) {
		return { category, page, endpoint, reason: errorMessage(error) };
	}
}

function productEndpoint(baseUrl: string, category: CategoryPaginationCategory, page: number, pageSize: number) {
	const from = page * pageSize;
	const to = from + pageSize - 1;
	const url = new URL(`/api/catalog_system/pub/products/search/${category.path}`, baseUrl);
	url.searchParams.set("_from", String(from));
	url.searchParams.set("_to", String(to));
	return url.toString();
}

async function getJson(endpoint: string, timeoutMs: number) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(endpoint, {
			signal: controller.signal,
			headers: {
				accept: "application/json",
				"accept-language": "es-AR,es;q=0.9,en;q=0.7",
				"user-agent": "ofertasSUPER bounded read-only category pagination audit",
				referer: new URL("/", endpoint).toString(),
			},
		});
		const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
		const contentRange = response.headers.get("content-range");
		const text = await response.text();
		if (response.status === 403 || response.status === 429) throw new Error(`blocked or rate-limited with status ${response.status}`);
		if (!contentType.includes("json") && /<html|captcha|access denied/i.test(text)) throw new Error("blocked HTML/captcha response");
		if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
		return { payload: JSON.parse(text) as unknown, status: response.status, contentRange };
	} finally {
		clearTimeout(timeout);
	}
}

function flattenCategories(payload: unknown, baseUrl: string) {
	const roots = Array.isArray(payload) ? payload : [];
	const categories: CategoryPaginationCategory[] = [];
	const visit = (raw: RawCategory) => {
		const name = text(raw.name ?? raw.Name);
		const id = text(raw.id ?? raw.Id) ?? name;
		const url = text(raw.url ?? raw.Url);
		const path = categoryPath(url, name, baseUrl);
		if (id && name && path) categories.push({ id, name, path, url });
		const children = raw.children ?? raw.Children;
		if (Array.isArray(children)) children.forEach((child) => visit(child as RawCategory));
	};
	roots.forEach((root) => visit(root as RawCategory));
	return categories.sort((left, right) => left.path.localeCompare(right.path));
}

function categoryPath(url: string | null, name: string | null, baseUrl: string) {
	if (url) {
		const pathname = new URL(url, baseUrl).pathname.replace(/^\/+|\/+$/g, "");
		if (pathname) return pathname;
	}
	return name?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ?? null;
}

function toAuditProduct(raw: unknown, baseUrl: string): CategoryPaginationProduct | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, unknown>;
	const normalized = normalizeProduct(record, baseUrl);
	return {
		ean: normalized?.ean ?? text(record.ean ?? record.EAN),
		skuId: normalized?.skuId ?? null,
		productId: text(record.productId),
		productUrl: normalized?.productUrl ?? null,
		name: normalized?.name ?? text(record.productName ?? record.name),
	};
}

function text(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : "unknown category pagination error";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	void main().catch((error) => {
		console.error(errorMessage(error));
		process.exitCode = 1;
	});
}
