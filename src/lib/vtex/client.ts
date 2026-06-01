import axios from "axios";

import {
	buildVtexCatalogSearchRequest,
	buildVtexRequest,
	type VtexCatalogLookup,
} from "./encode";
import { normalizeProduct, type NormalizedProduct } from "./normalize";

type LooseRecord = Record<string, unknown>;

type FetchVtexProductsOptions = {
  baseUrl: string;
  query: string;
  hash?: string;
  count?: number;
  retries?: number;
};

type FetchVtexDirectProductsOptions = {
	baseUrl: string;
	lookup: VtexCatalogLookup;
	retries?: number;
};

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

  while (queue.length > 0) {
    const current = queue.shift();

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

async function requestVtexCatalogPayload({
	baseUrl,
	lookup,
}: {
	baseUrl: string;
	lookup: VtexCatalogLookup;
}) {
	const request = buildVtexCatalogSearchRequest(lookup);
	const url = new URL(request.pathname, baseUrl);
	url.search = request.search;
	const startedAt = Date.now();

	try {
		await sleep(getRequestDelayMs());
		const response = await http.get(url.toString(), {
			headers: {
				"user-agent": pickUserAgent(),
				"accept-language": "es-AR,es;q=0.9,en;q=0.7",
				referer: `${new URL(baseUrl).origin}/`,
				origin: new URL(baseUrl).origin,
			},
			transformResponse: [(value) => value],
			responseType: "text",
		});
		const responseTimeMs = Date.now() - startedAt;
		const contentType = String(
			response.headers["content-type"] ?? "",
		).toLowerCase();
		const rawData = response.data;

		if (typeof rawData !== "string") {
			throw new VtexRequestError("Unexpected VTEX catalog payload type", {
				errorType: "unknown",
				hashValid: true,
				responseTimeMs,
			});
		}

		if (!contentType.includes("json") && detectBlockedPayload(rawData)) {
			throw new VtexRequestError(
				"VTEX catalog returned an HTML or anti-bot page",
				{
					errorType: "blocked",
					hashValid: true,
					responseTimeMs,
				},
			);
		}

		let payload: unknown;

		try {
			payload = JSON.parse(rawData);
		} catch {
			if (detectBlockedPayload(rawData)) {
				throw new VtexRequestError(
					"VTEX catalog returned a blocked HTML response",
					{
						errorType: "blocked",
						hashValid: true,
						responseTimeMs,
					},
				);
			}

			throw new VtexRequestError("VTEX catalog returned invalid JSON", {
				errorType: "unknown",
				hashValid: true,
				responseTimeMs,
			});
		}

		return {
			payload,
			responseTimeMs,
		};
	} catch (error) {
		if (error instanceof VtexRequestError) {
			throw error;
		}

		throw classifyAxiosError(error, Date.now() - startedAt);
	}
}

async function requestVtexPayload({
  baseUrl,
  query,
  hash,
  count,
}: {
  baseUrl: string;
  query: string;
  hash: string;
  count: number;
}) {
  const request = buildVtexRequest(query, hash, count);
  const url = new URL(request.pathname, baseUrl);
  url.search = request.search;
  const startedAt = Date.now();

  try {
    await sleep(getRequestDelayMs());
    const response = await http.get(url.toString(), {
      headers: {
        "user-agent": pickUserAgent(),
        "accept-language": "es-AR,es;q=0.9,en;q=0.7",
        referer: `${new URL(baseUrl).origin}/`,
        origin: new URL(baseUrl).origin,
      },
      transformResponse: [(value) => value],
      responseType: "text",
    });
    const responseTimeMs = Date.now() - startedAt;
		const contentType = String(
			response.headers["content-type"] ?? "",
		).toLowerCase();
    const rawData = response.data;

    if (typeof rawData !== "string") {
      throw new VtexRequestError("Unexpected VTEX payload type", {
        errorType: "unknown",
        hashValid: true,
        responseTimeMs,
      });
    }

    if (!contentType.includes("json") && detectBlockedPayload(rawData)) {
      throw new VtexRequestError("VTEX returned an HTML or anti-bot page", {
        errorType: "blocked",
        hashValid: true,
        responseTimeMs,
      });
    }

    let payload: unknown;

    try {
      payload = JSON.parse(rawData);
    } catch {
      if (detectBlockedPayload(rawData)) {
        throw new VtexRequestError("VTEX returned a blocked HTML response", {
          errorType: "blocked",
          hashValid: true,
          responseTimeMs,
        });
      }

      throw new VtexRequestError("VTEX returned invalid JSON", {
        errorType: "unknown",
        hashValid: true,
        responseTimeMs,
      });
    }

    if (detectHashInvalid(payload)) {
      throw new VtexRequestError(getErrorMessage(payload), {
        errorType: "hash_invalid",
        hashValid: false,
        responseTimeMs,
      });
    }

    return {
      payload,
      responseTimeMs,
    };
  } catch (error) {
    if (error instanceof VtexRequestError) {
      throw error;
    }

    throw classifyAxiosError(error, Date.now() - startedAt);
  }
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
}: FetchVtexDirectProductsOptions): Promise<NormalizedProduct[]> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= retries; attempt += 1) {
		try {
			const { payload } = await requestVtexCatalogPayload({
				baseUrl,
				lookup,
			});

			return normalizeVtexCatalogPayload(payload, baseUrl);
		} catch (error) {
			lastError = error;
			if (attempt < retries) {
				await sleep(400 * attempt);
			}
		}
	}

	throw lastError;
}

export async function fetchVtexProducts({
  baseUrl,
  query,
  hash = process.env.VTEX_SHA256_HASH,
  count = 50,
  retries = 3,
}: FetchVtexProductsOptions): Promise<NormalizedProduct[]> {
  if (!hash) {
    throw new Error("VTEX_SHA256_HASH is required");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { payload } = await requestVtexPayload({
        baseUrl,
        query,
        hash,
        count,
      });
      const rawProducts = extractProductRecords(payload);
      const normalized = rawProducts
        .map((product) => normalizeProduct(product, baseUrl))
        .filter((product): product is NormalizedProduct => Boolean(product));

			return Array.from(
				new Map(normalized.map((product) => [product.ean, product])).values(),
			);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(400 * attempt);
      }
    }
  }

  throw lastError;
}
