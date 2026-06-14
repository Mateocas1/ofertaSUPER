import { createHash } from "node:crypto";
import { posix, win32 } from "node:path";

import { getSupermarketBySlug } from "@/lib/supermarkets";

import { getOptionalSingleFlag, parsePositiveIntegerFlag, uniqueSorted } from "./audit-utils";

export type CategoryPaginationSource = "vea" | "disco" | "jumbo" | "mas";

export type CategoryPaginationCliOptions = {
	source: CategoryPaginationSource;
	output: string;
	requestBudget: number;
	categoryBudget: number;
	pageBudget: number;
	pageSize: number;
	timeoutMs: number;
	issue: number;
	generatedAt: string | null;
};

export type CategoryPaginationOutputBoundary = {
	issue: number;
	source: CategoryPaginationSource;
	surface: "category-pagination";
};

export type CategoryPaginationSourceConfig = {
	slug: CategoryPaginationSource;
	baseUrl: string;
};

export type CategoryPaginationCategory = {
	id: string;
	name: string;
	path: string;
	url: string | null;
};

export type CategoryPaginationProduct = {
	ean?: string | null;
	skuId?: string | null;
	productId?: string | null;
	productUrl?: string | null;
	name?: string | null;
};

export type CategoryPaginationPageResult = {
	category: CategoryPaginationCategory;
	page: number;
	from: number;
	to: number;
	endpoint: string;
	status: number;
	contentRange: string | null;
	products: CategoryPaginationProduct[];
};

export type CategoryPaginationFetchError = {
	category?: CategoryPaginationCategory;
	page?: number;
	endpoint: string;
	reason: string;
	status?: number;
};

export type CategoryPaginationAuditReport = {
	schemaVersion: 1;
	audit: `${CategoryPaginationSource}-category-pagination-discovery-surface`;
	bounded: true;
	exhaustive: false;
	readOnly: true;
	generatedAt: string;
	issue: number;
	source: {
		slug: CategoryPaginationSource;
		baseUrl: string;
	};
	surface: {
		kind: "category-pagination";
		endpointPattern: string;
		categoryTreeEndpoint: string;
		pagination: {
			style: "_from/_to";
			pageSize: number;
			pageBudgetPerCategory: number;
			stopWhenReturnedLessThanPageSize: true;
		};
	};
	lineage: {
		issue: number;
		outputPath: string;
		tool: "scripts/audit-category-pagination.ts";
		requestSha256: string;
		writeBoundary: string;
	};
	budgets: {
		request: { limit: number; used: number; status: "PASS" | "FAIL" };
		category: { limit: number; used: number; status: "PASS" | "FAIL" };
		page: { limitPerCategory: number; maxUsedForCategory: number; status: "PASS" | "FAIL" };
		timeoutMs: number;
		stopCondition: { triggered: boolean; reasons: string[] };
	};
	counts: {
		categoryRows: number;
		categoryRowsAudited: number;
		pageRequests: number;
		fetchedRows: number;
		denominatorCandidates: number;
		duplicateRows: number;
		ambiguousRows: number;
		errorRows: number;
	};
	endpointBehavior: {
		categoryTree: { endpoint: string; status: number | null; categoriesDiscovered: number };
		productSearch: Array<{
			categoryPath: string;
			pagesFetched: number;
			lastStatus: number | null;
			lastContentRange: string | null;
			stopReason: string;
		}>;
	};
	candidates: Array<{
		source: CategoryPaginationSource;
		surface: "category-pagination";
		identityKind: "ean" | "skuId" | "productId" | "url" | "name";
		identity: string;
		categoryPath: string;
		productUrl: string | null;
	}>;
	errors: Array<{ endpoint: string; reason: string; status?: number }>;
	confidence: { status: "PASS" | "FAIL"; reasons: string[] };
	posture: {
		readOnly: true;
		productionWrites: false;
		dbWrites: false;
		artifactWrites: string;
		bounded: true;
		exhaustive: false;
		writeBoundary: string;
		rejectedOperations: string[];
	};
};

const FORBIDDEN_FLAGS = [
	"--apply",
	"--write",
	"--confirm",
	"--execute",
	"--delete",
	"--scheduler",
	"--all-source",
	"--all-sources",
	"--deploy",
	"--migrations",
	"--purge-cache",
	"--production",
];
const ALLOWED_FLAGS = new Set([
	"--source",
	"--output",
	"--request-budget",
	"--category-budget",
	"--page-budget",
	"--page-size",
	"--timeout-ms",
	"--issue-number",
	"--generated-at",
]);
const APPROVED_CATEGORY_PAGINATION_SOURCES = ["vea", "disco", "jumbo", "mas"] as const;
const DEFAULT_ISSUE = 263;
const CATEGORY_TREE_ENDPOINT = "/api/catalog_system/pub/category/tree/3";
const PRODUCT_ENDPOINT_PATTERN = "/api/catalog_system/pub/products/search/{categoryPath}?_from={from}&_to={to}";

export function parseCategoryPaginationCliOptions(argv = process.argv): CategoryPaginationCliOptions {
	const foundForbidden = argv.find((entry) =>
		FORBIDDEN_FLAGS.some((flag) => entry === flag || entry.startsWith(`${flag}=`)),
	);
	if (foundForbidden) throw new Error(`category pagination audit rejects ${foundForbidden}`);

	const unknownFlag = argv
		.slice(2)
		.find((entry) => entry.startsWith("--") && !ALLOWED_FLAGS.has(entry.split("=", 1)[0]));
	if (unknownFlag) throw new Error(`unknown category pagination audit flag ${unknownFlag}`);

	const bareAllowedFlag = argv.slice(2).find((entry) => ALLOWED_FLAGS.has(entry));
	if (bareAllowedFlag) throw new Error(`category pagination audit requires ${bareAllowedFlag}=...`);

	const source = resolveCategoryPaginationSource(getOptionalSingleFlag(argv, "--source") ?? "vea");
	const boundary = categoryPaginationOutputBoundary({
		issue: parsePositiveIntegerFlag(argv, "--issue-number", DEFAULT_ISSUE),
		source,
		surface: "category-pagination",
	});

	const generatedAt = getOptionalSingleFlag(argv, "--generated-at")?.trim() ?? null;
	if (generatedAt) requireValidIsoTimestamp(generatedAt, "--generated-at");

	return {
		source,
		output: normalizeCategoryPaginationOutputPath(
			getOptionalSingleFlag(argv, "--output")?.trim() ?? defaultCategoryPaginationOutputPath(boundary),
			boundary,
		),
		requestBudget: parsePositiveIntegerFlag(argv, "--request-budget", 10),
		categoryBudget: parsePositiveIntegerFlag(argv, "--category-budget", 3),
		pageBudget: parsePositiveIntegerFlag(argv, "--page-budget", 2),
		pageSize: parsePositiveIntegerFlag(argv, "--page-size", 10),
		timeoutMs: parsePositiveIntegerFlag(argv, "--timeout-ms", 10_000),
		issue: boundary.issue,
		generatedAt,
	};
}

export function normalizeCategoryPaginationOutputPath(
	output: string,
	boundary: CategoryPaginationOutputBoundary = categoryPaginationOutputBoundary({ issue: DEFAULT_ISSUE, source: "vea", surface: "category-pagination" }),
) {
	const allowedOutputPrefix = categoryPaginationOutputPrefix(boundary);
	if (!output) throw new Error(`category pagination output must be under ${allowedOutputPrefix}`);
	if (output.includes("\0")) throw new Error("category pagination output path contains an invalid character");
	if (win32.isAbsolute(output) || posix.isAbsolute(output)) throw new Error("category pagination output must be repo-relative");
	const segments = output.split(/[\\/]+/);
	if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("category pagination output rejects traversal or unsafe path segments");
	const normalized = segments.join(posix.sep);
	if (!normalized.startsWith(allowedOutputPrefix)) throw new Error(`category pagination output must be under ${allowedOutputPrefix}`);
	if (!normalized.endsWith(".json")) throw new Error("category pagination output must be a .json artifact");
	return normalized;
}

export function buildCategoryPaginationAuditReport({
	generatedAt,
	source = "vea",
	issue,
	outputPath,
	requestBudget,
	categoryBudget,
	pageBudget,
	pageSize,
	timeoutMs,
	categories,
	categoryTreeStatus,
	pages,
	errors,
}: {
	generatedAt: Date;
	source?: CategoryPaginationSource;
	issue: number;
	outputPath: string;
	requestBudget: number;
	categoryBudget: number;
	pageBudget: number;
	pageSize: number;
	timeoutMs: number;
	categories: CategoryPaginationCategory[];
	categoryTreeStatus: number | null;
	pages: CategoryPaginationPageResult[];
	errors: CategoryPaginationFetchError[];
}): CategoryPaginationAuditReport {
	const sourceConfig = getCategoryPaginationSourceConfig(source);
	const boundary = categoryPaginationOutputBoundary({ issue, source: sourceConfig.slug, surface: "category-pagination" });
	const safeOutputPath = normalizeCategoryPaginationOutputPath(outputPath, boundary);
	const writeBoundary = categoryPaginationWriteBoundary(boundary);
	const generatedAtIso = requireValidDate(generatedAt, "generatedAt").toISOString();
	const auditedCategories = uniqueSorted(pages.map((page) => page.category.path));
	const rowsByIdentity = new Map<string, CategoryPaginationAuditReport["candidates"][number] & { rows: number }>();
	let ambiguousRows = 0;

	for (const page of pages) {
		for (const product of page.products) {
			const identity = pickIdentity(product);
			if (!identity) {
				ambiguousRows += 1;
				continue;
			}
			const key = `${identity.kind}:${identity.value}`;
			const existing = rowsByIdentity.get(key);
			if (existing) existing.rows += 1;
			else rowsByIdentity.set(key, {
				source: sourceConfig.slug,
				surface: "category-pagination",
				identityKind: identity.kind,
				identity: identity.value,
				categoryPath: page.category.path,
				productUrl: normalizedText(product.productUrl),
				rows: 1,
			});
		}
	}

	const endpointBehavior = auditedCategories.map((categoryPath) => {
		const categoryPages = pages.filter((page) => page.category.path === categoryPath);
		const lastPage = categoryPages.at(-1);
		return {
			categoryPath,
			pagesFetched: categoryPages.length,
			lastStatus: lastPage?.status ?? null,
			lastContentRange: lastPage?.contentRange ?? null,
			stopReason: getPaginationStopReason(categoryPages, pageBudget, pageSize, errors),
		};
	});

	const requestUsed = 1 + pages.length + errors.length;
	const maxPagesForCategory = endpointBehavior.reduce((max, entry) => Math.max(max, entry.pagesFetched), 0);
	const stopReasons = uniqueSorted([
		...(requestUsed > requestBudget ? [`request budget exceeded: used ${requestUsed} > limit ${requestBudget}`] : []),
		...(auditedCategories.length >= categoryBudget && categories.length > categoryBudget ? [`category budget reached: audited ${auditedCategories.length} of ${categories.length}`] : []),
		...(maxPagesForCategory >= pageBudget ? [`page budget reached for at least one category: limit ${pageBudget}`] : []),
		...errors.map((error) => error.reason),
	]);
	const confidenceReasons = uniqueSorted([
		...stopReasons,
		...(ambiguousRows > 0 ? [`ambiguous products require fail-closed review: ${ambiguousRows}`] : []),
	]);

	return {
		schemaVersion: 1,
		audit: `${sourceConfig.slug}-category-pagination-discovery-surface`,
		bounded: true,
		exhaustive: false,
		readOnly: true,
		generatedAt: generatedAtIso,
		issue,
		source: { slug: sourceConfig.slug, baseUrl: sourceConfig.baseUrl },
		surface: {
			kind: "category-pagination",
			endpointPattern: PRODUCT_ENDPOINT_PATTERN,
			categoryTreeEndpoint: CATEGORY_TREE_ENDPOINT,
			pagination: { style: "_from/_to", pageSize, pageBudgetPerCategory: pageBudget, stopWhenReturnedLessThanPageSize: true },
		},
		lineage: {
			issue,
			outputPath: safeOutputPath,
			tool: "scripts/audit-category-pagination.ts",
			requestSha256: sha256(stableJson({ source: sourceConfig.slug, issue, requestBudget, categoryBudget, pageBudget, pageSize, timeoutMs })),
			writeBoundary,
		},
		budgets: {
			request: { limit: requestBudget, used: requestUsed, status: requestUsed <= requestBudget ? "PASS" : "FAIL" },
			category: { limit: categoryBudget, used: auditedCategories.length, status: auditedCategories.length <= categoryBudget ? "PASS" : "FAIL" },
			page: { limitPerCategory: pageBudget, maxUsedForCategory: maxPagesForCategory, status: maxPagesForCategory <= pageBudget ? "PASS" : "FAIL" },
			timeoutMs,
			stopCondition: { triggered: stopReasons.length > 0, reasons: stopReasons },
		},
		counts: {
			categoryRows: categories.length,
			categoryRowsAudited: auditedCategories.length,
			pageRequests: pages.length,
			fetchedRows: pages.reduce((sum, page) => sum + page.products.length, 0),
			denominatorCandidates: rowsByIdentity.size,
			duplicateRows: Array.from(rowsByIdentity.values()).reduce((sum, candidate) => sum + candidate.rows - 1, 0),
			ambiguousRows,
			errorRows: errors.length,
		},
		endpointBehavior: {
			categoryTree: { endpoint: CATEGORY_TREE_ENDPOINT, status: categoryTreeStatus, categoriesDiscovered: categories.length },
			productSearch: endpointBehavior,
		},
		candidates: Array.from(rowsByIdentity.values())
			.map(({ rows: _rows, ...candidate }) => candidate)
			.sort((left, right) => `${left.identityKind}:${left.identity}`.localeCompare(`${right.identityKind}:${right.identity}`)),
		errors: errors.map(({ endpoint, reason, status }) => ({ endpoint, reason, ...(status ? { status } : {}) })),
		confidence: { status: confidenceReasons.length === 0 ? "PASS" : "FAIL", reasons: confidenceReasons },
		posture: {
			readOnly: true,
			productionWrites: false,
			dbWrites: false,
			artifactWrites: `issue-${issue}-category-pagination-audit-only`,
			bounded: true,
			exhaustive: false,
			writeBoundary,
			rejectedOperations: [...FORBIDDEN_FLAGS],
		},
	};
}

export function categoryPaginationOutputBoundary(boundary: CategoryPaginationOutputBoundary): CategoryPaginationOutputBoundary {
	if (!Number.isInteger(boundary.issue) || boundary.issue <= 0) throw new Error("category pagination output requires a positive issue number");
	resolveCategoryPaginationSource(boundary.source);
	if (boundary.surface !== "category-pagination") throw new Error("category pagination output boundary is approved only for category-pagination");
	return boundary;
}

export function categoryPaginationOutputPrefix(boundary: CategoryPaginationOutputBoundary) {
	const safeBoundary = categoryPaginationOutputBoundary(boundary);
	return `audit/coverage/issue-${safeBoundary.issue}/${safeBoundary.source}/${safeBoundary.surface}/`;
}

export function defaultCategoryPaginationOutputPath(boundary: CategoryPaginationOutputBoundary) {
	return `${categoryPaginationOutputPrefix(boundary)}category-pagination-audit.json`;
}

function categoryPaginationWriteBoundary(boundary: CategoryPaginationOutputBoundary) {
	return `bounded read-only ${boundary.source} category pagination audit; artifact-only write under ${categoryPaginationOutputPrefix(boundary)}; no DB writes, no discovery apply, no scheduler/all-source execution, no deploy, no migrations, no cache purge, no production writes`;
}

export function resolveCategoryPaginationSource(source: string): CategoryPaginationSource {
	const normalized = source.trim().toLowerCase();
	if (!APPROVED_CATEGORY_PAGINATION_SOURCES.includes(normalized as CategoryPaginationSource)) {
		throw new Error(`category pagination audit is approved only for --source=${APPROVED_CATEGORY_PAGINATION_SOURCES.join(" or --source=")}`);
	}
	const supermarket = getSupermarketBySlug(normalized);
	if (supermarket.adapter !== "vtex") throw new Error(`category pagination audit requires a VTEX source: ${normalized}`);
	return normalized as CategoryPaginationSource;
}

export function getCategoryPaginationSourceConfig(source: CategoryPaginationSource): CategoryPaginationSourceConfig {
	const slug = resolveCategoryPaginationSource(source);
	const supermarket = getSupermarketBySlug(slug);
	return { slug, baseUrl: supermarket.baseUrl };
}

export function selectCategoryPaginationAuditCategories(
	categories: CategoryPaginationCategory[],
	categoryBudget: number,
) {
	const selected: CategoryPaginationCategory[] = [];
	const seenPaths = new Set<string>();
	for (const category of categories) {
		if (seenPaths.has(category.path)) continue;
		seenPaths.add(category.path);
		selected.push(category);
		if (selected.length >= categoryBudget) break;
	}
	return selected;
}

function pickIdentity(product: CategoryPaginationProduct) {
	for (const kind of ["ean", "skuId", "productId", "productUrl", "name"] as const) {
		const value = normalizedText(product[kind]);
		if (!value) continue;
		return { kind: kind === "productUrl" ? "url" as const : kind, value };
	}
	return null;
}

function getPaginationStopReason(
	categoryPages: CategoryPaginationPageResult[],
	pageBudget: number,
	pageSize: number,
	errors: CategoryPaginationFetchError[],
) {
	const lastPage = categoryPages.at(-1);
	const error = lastPage
		? errors.find((entry) => entry.category?.path === lastPage.category.path)
		: null;
	if (error) return error.reason;
	if (!lastPage) return "not audited";
	if (lastPage.products.length < pageSize) return `returned ${lastPage.products.length} < page size ${pageSize}`;
	if (categoryPages.length >= pageBudget) return `page budget reached at ${pageBudget} pages`;
	return "bounded audit stopped before exhaustion could be proven";
}

function normalizedText(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

function requireValidIsoTimestamp(value: string, label: string) {
	const parsed = new Date(value);
	if (!isValidDate(parsed) || parsed.toISOString() !== value) throw new Error(`category pagination audit requires valid ISO timestamp for ${label}`);
	return value;
}

function requireValidDate(value: Date, label: string) {
	if (!isValidDate(value)) throw new Error(`category pagination audit requires valid ${label}`);
	return value;
}

function isValidDate(value: Date) {
	return value instanceof Date && Number.isFinite(value.getTime());
}

function stableJson(value: unknown) {
	return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function sha256(value: string) {
	return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
