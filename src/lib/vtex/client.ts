import axios from "axios";

import {
	buildVtexCatalogSearchRequest,
	buildVtexRequest,
	type VtexCatalogLookup,
} from "./encode";
import { normalizeProduct, type NormalizedProduct } from "./normalize";

type LooseRecord = Record<string, unknown>;

export type VtexProductsResult = NormalizedProduct[] & {
  fallbackUsed?: boolean;
};

type VtexHttpResponse = {
  data: unknown;
  headers: { "content-type"?: unknown };
};

type VtexHttpRequest = {
  headers: {
    "user-agent": string;
    "accept-language": string;
    referer: string;
    origin: string;
  };
  transformResponse: [(value: string) => string];
  responseType: "text";
};

type VtexHttpClient = {
  get: (url: string, request: VtexHttpRequest) => Promise<VtexHttpResponse>;
};

export type VtexClientDependencies = {
  http?: VtexHttpClient;
  sleep?: (ms: number) => Promise<void>;
};

type FetchVtexProductsOptions = {
  baseUrl: string;
  query: string;
  hash?: string;
  count?: number;
  retries?: number;
  dependencies?: VtexClientDependencies;
};

type FetchVtexDirectProductsOptions = {
	baseUrl: string;
	lookup: VtexCatalogLookup;
	retries?: number;
  dependencies?: VtexClientDependencies;
};

const MAX_VTEX_SEARCH_COUNT = 50;

type VtexProbeErrorType =
	| "hash_invalid"
	| "timeout"
	| "blocked"
	| "network"
	| "unknown";

export type VtexProbeResult = {
  isHealthy: boolean;
  hashValid: boolean;
  errorType: VtexProbeErrorType | null;
  responseTimeMs: number;
  productsReturned: number;
  hash: string;
};

class VtexRequestError extends Error {
  readonly errorType: VtexProbeErrorType;
  readonly hashValid: boolean;
  readonly responseTimeMs: number;

	constructor(
		message: string,
		options: {
			errorType: VtexProbeErrorType;
			hashValid: boolean;
			responseTimeMs: number;
		},
	) {
    super(message);
    this.name = "VtexRequestError";
    this.errorType = options.errorType;
    this.hashValid = options.hashValid;
    this.responseTimeMs = options.responseTimeMs;
  }
}

const http = axios.create({
  timeout: 15_000,
  headers: {
    accept: "application/json",
  },
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
];

function readNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getRequestDelayMs() {
  const min = readNumberEnv("VTEX_REQUEST_MIN_DELAY_MS", 800);
  const max = readNumberEnv("VTEX_REQUEST_MAX_DELAY_MS", 2500);
  const lower = Math.min(min, max);
  const upper = Math.max(min, max);

  return lower + Math.floor(Math.random() * (upper - lower + 1));
}

function pickUserAgent() {
	const configured = process.env.VTEX_USER_AGENTS?.split("|")
		.map((entry) => entry.trim())
		.filter(Boolean);
  const pool = configured?.length ? configured : DEFAULT_USER_AGENTS;

  return pool[Math.floor(Math.random() * pool.length)];
}

function getErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "Unknown VTEX error";
  }

  const value = JSON.stringify(payload);
  return value.length > 300 ? `${value.slice(0, 297)}...` : value;
}

function detectHashInvalid(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const serialized = JSON.stringify(payload).toLowerCase();
  return (
    serialized.includes("persistedquerynotfound") ||
    serialized.includes("persisted query") ||
    serialized.includes("sha256hash") ||
    serialized.includes("graphql query was not found")
  );
}

function detectBlockedPayload(payload: unknown) {
  if (typeof payload !== "string") {
    return false;
  }

  const normalized = payload.toLowerCase();
	return (
		normalized.includes("captcha") ||
		normalized.includes("access denied") ||
		normalized.includes("<html")
	);
}

function classifyAxiosError(error: unknown, responseTimeMs: number) {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return new VtexRequestError("VTEX request timed out", {
        errorType: "timeout",
        hashValid: true,
        responseTimeMs,
      });
    }

    const status = error.response?.status;
    const data = error.response?.data;

    if (detectHashInvalid(data)) {
      return new VtexRequestError(getErrorMessage(data), {
        errorType: "hash_invalid",
        hashValid: false,
        responseTimeMs,
      });
    }

		if (
			status === 403 ||
			status === 429 ||
			detectBlockedPayload(typeof data === "string" ? data : null)
		) {
			return new VtexRequestError(
				`VTEX source blocked with status ${status ?? "unknown"}`,
				{
        errorType: "blocked",
        hashValid: true,
        responseTimeMs,
				},
			);
    }

    return new VtexRequestError(error.message, {
      errorType: "network",
      hashValid: true,
      responseTimeMs,
    });
  }

	return new VtexRequestError(
		error instanceof Error ? error.message : "Unknown VTEX error",
		{
    errorType: "unknown",
    hashValid: true,
    responseTimeMs,
		},
	);
}

function isCandidateProduct(value: unknown): value is LooseRecord {
  return Boolean(
    value &&
      typeof value === "object" &&
      ("productName" in value || "items" in value),
  );
}

function extractProductRecords(payload: unknown): LooseRecord[] {
  const queue: unknown[] = [payload];
  const products: LooseRecord[] = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (!current || typeof current !== "object") {
      continue;
    }

    if (isCandidateProduct(current)) {
      products.push(current);
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }

  return products;
}

type VtexPayloadMessages = {
  unexpectedType: string;
  blockedResponse: string;
  blockedJson: string;
  invalidJson: string;
};

function buildVtexHttpRequest(baseUrl: string): VtexHttpRequest {
  const origin = new URL(baseUrl).origin;
  return {
    headers: {
      "user-agent": pickUserAgent(),
      "accept-language": "es-AR,es;q=0.9,en;q=0.7",
      referer: `${origin}/`,
      origin,
    },
    transformResponse: [(value: string) => value],
    responseType: "text",
  };
}

function parseVtexJsonPayload(
  response: VtexHttpResponse,
  responseTimeMs: number,
  messages: VtexPayloadMessages,
) {
  const rawData = response.data;
  if (typeof rawData !== "string") {
    throw new VtexRequestError(messages.unexpectedType, {
      errorType: "unknown",
      hashValid: true,
      responseTimeMs,
    });
  }

  const contentType = String(response.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.includes("json") && detectBlockedPayload(rawData)) {
    throw new VtexRequestError(messages.blockedResponse, {
      errorType: "blocked",
      hashValid: true,
      responseTimeMs,
    });
  }

  try {
    return JSON.parse(rawData) as unknown;
  } catch {
    if (detectBlockedPayload(rawData)) {
      throw new VtexRequestError(messages.blockedJson, {
        errorType: "blocked",
        hashValid: true,
        responseTimeMs,
      });
    }

    throw new VtexRequestError(messages.invalidJson, {
      errorType: "unknown",
      hashValid: true,
      responseTimeMs,
    });
  }
}

async function requestVtexJsonPayload({
  baseUrl,
  request,
  dependencies = {},
  messages,
}: {
  baseUrl: string;
  request: { pathname: string; search: string };
  dependencies?: VtexClientDependencies;
  messages: VtexPayloadMessages;
}) {
  const url = new URL(request.pathname, baseUrl);
  url.search = request.search;
  const startedAt = Date.now();

  try {
    await (dependencies.sleep ?? sleep)(getRequestDelayMs());
    const response = await (dependencies.http ?? http).get(url.toString(), buildVtexHttpRequest(baseUrl));
    const responseTimeMs = Date.now() - startedAt;
    return { payload: parseVtexJsonPayload(response, responseTimeMs, messages), responseTimeMs };
  } catch (error) {
    if (error instanceof VtexRequestError) throw error;
    throw classifyAxiosError(error, Date.now() - startedAt);
  }
}

const CATALOG_PAYLOAD_MESSAGES: VtexPayloadMessages = {
  unexpectedType: "Unexpected VTEX catalog payload type",
  blockedResponse: "VTEX catalog returned an HTML or anti-bot page",
  blockedJson: "VTEX catalog returned a blocked HTML response",
  invalidJson: "VTEX catalog returned invalid JSON",
};

const PERSISTED_PAYLOAD_MESSAGES: VtexPayloadMessages = {
  unexpectedType: "Unexpected VTEX payload type",
  blockedResponse: "VTEX returned an HTML or anti-bot page",
  blockedJson: "VTEX returned a blocked HTML response",
  invalidJson: "VTEX returned invalid JSON",
};

async function requestVtexCatalogPayload({
  baseUrl,
  request,
  dependencies = {},
}: {
  baseUrl: string;
  request: { pathname: string; search: string };
  dependencies?: VtexClientDependencies;
}) {
  return requestVtexJsonPayload({ baseUrl, request, dependencies, messages: CATALOG_PAYLOAD_MESSAGES });
}

function ensurePersistedHashIsValid(payload: unknown, responseTimeMs: number) {
  if (!detectHashInvalid(payload)) return;
  throw new VtexRequestError(getErrorMessage(payload), {
    errorType: "hash_invalid",
    hashValid: false,
    responseTimeMs,
  });
}

async function requestVtexPayload({
  baseUrl,
  query,
  hash,
  count,
  dependencies = {},
}: {
  baseUrl: string;
  query: string;
  hash: string;
  count: number;
  dependencies?: VtexClientDependencies;
}) {
  const result = await requestVtexJsonPayload({
    baseUrl,
    request: buildVtexRequest(query, hash, count),
    dependencies,
    messages: PERSISTED_PAYLOAD_MESSAGES,
  });
  ensurePersistedHashIsValid(result.payload, result.responseTimeMs);
  return result;
}

export async function probeVtexHash({
  baseUrl,
  query = "leche",
  hash = process.env.VTEX_SHA256_HASH,
  count = 5,
}: {
  baseUrl: string;
  query?: string;
  hash?: string;
  count?: number;
}): Promise<VtexProbeResult> {
  if (!hash) {
    throw new Error("VTEX_SHA256_HASH is required");
  }

  try {
    const { payload, responseTimeMs } = await requestVtexPayload({
      baseUrl,
      query,
      hash,
      count,
    });
    const rawProducts = extractProductRecords(payload);
    const products = rawProducts
      .map((product) => normalizeProduct(product, baseUrl))
      .filter((product): product is NormalizedProduct => Boolean(product));

    return {
      isHealthy: true,
      hashValid: true,
      errorType: null,
      responseTimeMs,
      productsReturned: products.length,
      hash,
    };
  } catch (error) {
    if (error instanceof VtexRequestError) {
      return {
        isHealthy: false,
        hashValid: error.hashValid,
        errorType: error.errorType,
        responseTimeMs: error.responseTimeMs,
        productsReturned: 0,
        hash,
      };
    }

    throw error;
  }
}

export function normalizeVtexCatalogPayload(payload: unknown, baseUrl: string) {
	const rawProducts = extractProductRecords(payload);
	return rawProducts
		.map((product) => normalizeProduct(product, baseUrl))
		.filter((product): product is NormalizedProduct => Boolean(product));
}

export async function fetchVtexDirectProducts({
	baseUrl,
	lookup,
	retries = 3,
  dependencies = {},
}: FetchVtexDirectProductsOptions): Promise<VtexProductsResult> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= retries; attempt += 1) {
		try {
			const { payload } = await requestVtexCatalogPayload({
				baseUrl,
				request: buildVtexCatalogSearchRequest(lookup),
        dependencies,
			});

			return normalizeVtexCatalogPayload(payload, baseUrl);
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await (dependencies.sleep ?? sleep)(400 * attempt);
			}
		}
	}

	throw lastError;
}

function dedupeVtexProducts(payload: unknown, baseUrl: string): VtexProductsResult {
  return Array.from(
    new Map(normalizeVtexCatalogPayload(payload, baseUrl).map((product) => [product.ean, product])).values(),
  );
}

function markFallbackUsed(products: VtexProductsResult): VtexProductsResult {
  products.fallbackUsed = true;
  return products;
}

function getBoundedSearchCount(count: number) {
  if (!Number.isFinite(count)) return MAX_VTEX_SEARCH_COUNT;
  return Math.min(Math.max(Math.floor(count), 1), MAX_VTEX_SEARCH_COUNT);
}

function isHashInvalidRequestError(error: unknown) {
  return error instanceof VtexRequestError && error.errorType === "hash_invalid";
}

function buildVtexTermFallbackRequest(query: string, count: number) {
  return {
    pathname: "/api/catalog_system/pub/products/search",
    search: new URLSearchParams({
      ft: query,
      _from: "0",
      _to: String(count - 1),
    }).toString(),
  };
}

async function fetchVtexTermFallback(baseUrl: string, query: string, count: number, dependencies: VtexClientDependencies) {
  const { payload } = await requestVtexCatalogPayload({
    baseUrl,
    request: buildVtexTermFallbackRequest(query, count),
    dependencies,
  });
  return markFallbackUsed(dedupeVtexProducts(payload, baseUrl));
}

async function waitForVtexRetry(attempt: number, retries: number, dependencies: VtexClientDependencies) {
  if (attempt < retries) await (dependencies.sleep ?? sleep)(400 * attempt);
}

export async function fetchVtexProducts({
  baseUrl,
  query,
  hash = process.env.VTEX_SHA256_HASH,
  count = MAX_VTEX_SEARCH_COUNT,
  retries = 3,
  dependencies = {},
}: FetchVtexProductsOptions): Promise<VtexProductsResult> {
  if (!hash) {
    throw new Error("VTEX_SHA256_HASH is required");
  }

  const boundedCount = getBoundedSearchCount(count);
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { payload } = await requestVtexPayload({
        baseUrl,
        query,
        hash,
        count: boundedCount,
        dependencies,
      });
      return dedupeVtexProducts(payload, baseUrl);
    } catch (error) {
      if (isHashInvalidRequestError(error)) {
        return fetchVtexTermFallback(baseUrl, query, boundedCount, dependencies);
      }

      lastError = error;
      await waitForVtexRetry(attempt, retries, dependencies);
    }
  }

  throw lastError;
}
