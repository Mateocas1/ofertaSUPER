import { fetchVtexStorefrontHtml, probeVtexHash } from "./client";

// VTEX IO storefronts inline a runtime document whose `cacheHints` object maps
// every registered persisted-query sha256 hash to the provider and sender app
// that registered it. The registry does not name the operation, so discovery
// returns ordered candidates and validates each one against the product
// search query before trusting it.
const SEARCH_GRAPHQL_PROVIDER = "vtex.search-graphql@0.x";
const PRODUCT_SUGGESTIONS_SENDER = "vtex.store-resources@0.x";
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const SCRIPT_PATTERN = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

export type VtexHashCandidate = {
  hash: string;
  provider: string;
  sender: string;
};

export type VtexHashDiscoveryDependencies = {
  fetchStorefront?: (baseUrl: string) => Promise<string>;
  validateCandidate?: (candidate: VtexHashCandidate) => Promise<boolean>;
};

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readCacheHints(value: unknown): Record<string, unknown> | null {
  const document = readObject(value);
  return document ? readObject(document.cacheHints) : null;
}

function readCandidate(hash: string, metadata: unknown): VtexHashCandidate | null {
  if (!SHA256_PATTERN.test(hash)) {
    return null;
  }

  const entry = readObject(metadata);
  if (!entry || entry.provider !== SEARCH_GRAPHQL_PROVIDER || typeof entry.sender !== "string") {
    return null;
  }

  return { hash, provider: SEARCH_GRAPHQL_PROVIDER, sender: entry.sender };
}

function collectCandidates(registry: Record<string, unknown>, seen: Set<string>) {
  const candidates: VtexHashCandidate[] = [];

  for (const [hash, metadata] of Object.entries(registry)) {
    if (seen.has(hash)) continue;
    const candidate = readCandidate(hash, metadata);
    if (!candidate) continue;
    seen.add(hash);
    candidates.push(candidate);
  }

  return candidates;
}

function parseRuntimeRegistries(html: string) {
  const registries: Array<Record<string, unknown>> = [];

  for (const match of html.matchAll(SCRIPT_PATTERN)) {
    const source = match[1].trim();
    if (!source.startsWith("{")) continue;

    try {
      const registry = readCacheHints(JSON.parse(source));
      if (registry) registries.push(registry);
    } catch {
      continue;
    }
  }

  return registries;
}

// The app that owns productSuggestions is probed first; the rest stay as a
// fallback for stores that register the query from another sender.
function preferSuggestionsSender(candidates: VtexHashCandidate[]) {
  const preferred = candidates.filter((entry) => entry.sender === PRODUCT_SUGGESTIONS_SENDER);
  const rest = candidates.filter((entry) => entry.sender !== PRODUCT_SUGGESTIONS_SENDER);
  return [...preferred, ...rest];
}

export function extractVtexHashCandidates(html: string): VtexHashCandidate[] {
  const seen = new Set<string>();
  const candidates: VtexHashCandidate[] = [];

  for (const registry of parseRuntimeRegistries(html)) {
    candidates.push(...collectCandidates(registry, seen));
  }

  return preferSuggestionsSender(candidates);
}

export async function discoverVtexHash({
  baseUrl,
  dependencies = {},
}: {
  baseUrl: string;
  dependencies?: VtexHashDiscoveryDependencies;
}): Promise<VtexHashCandidate | null> {
  const html = dependencies.fetchStorefront
    ? await dependencies.fetchStorefront(baseUrl)
    : await fetchVtexStorefrontHtml({ baseUrl });
  const candidates = extractVtexHashCandidates(html);
  const validate = dependencies.validateCandidate ?? (async (candidate: VtexHashCandidate) => {
    const probe = await probeVtexHash({ baseUrl, hash: candidate.hash, count: 3 });
    return probe.isHealthy && probe.productSuggestionsFound;
  });

  for (const candidate of candidates) {
    if (await validate(candidate)) {
      return candidate;
    }
  }

  return null;
}
