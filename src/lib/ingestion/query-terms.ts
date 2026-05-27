import { db } from "@/lib/db";
import { DEFAULT_SEARCH_TERMS } from "@/lib/vtex/categories";

type ResolveIngestionQueryTermsOptions = {
  slug: string;
  queryTerms?: string[];
  limit?: number;
  strategy?: "legacy" | "peer";
};

const STOP_WORDS = new Set([
  "con",
  "de",
  "del",
  "el",
  "en",
  "la",
  "las",
  "los",
  "para",
  "por",
  "sin",
  "un",
  "una",
  "x",
  "y",
]);

const UNIT_TOKENS = [/^\d+[.,]?\d*$/, /^\d+(kg|g|gr|ml|l|lt|lts)$/i, /^(kg|g|gr|ml|l|lt|lts|cc|un|u)$/i];

function normalizeQueryTerm(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaningfulToken(token: string) {
  if (token.length < 3) {
    return false;
  }

  if (STOP_WORDS.has(token)) {
    return false;
  }

  return !UNIT_TOKENS.some((pattern) => pattern.test(token));
}

function compactTokens(value: string) {
  return normalizeQueryTerm(value)
    .split(" ")
    .filter(isMeaningfulToken);
}

function deriveCompactTerms(value: string) {
  const tokens = compactTokens(value);
  const derived: string[] = [];

  if (tokens.length >= 2) {
    derived.push(tokens.slice(0, 2).join(" "));
  }

  if (tokens.length >= 3) {
    derived.push(tokens.slice(0, 3).join(" "));
  }

  if (tokens.length >= 1) {
    derived.push(tokens[0]);
  }

  return derived;
}

function expandIngestionQueryTerms(rawTerms: string[]) {
  const expanded = new Set<string>();

  for (const term of rawTerms) {
    const normalized = normalizeQueryTerm(term);

    if (!normalized) {
      continue;
    }

    for (const compact of deriveCompactTerms(normalized)) {
      expanded.add(compact);
    }

    expanded.add(normalized);
  }

  return Array.from(expanded);
}

async function buildCatalogDrivenTerms(limit: number) {
  const products = await db.product.findMany({
    take: Math.max(limit * 16, 120),
    select: {
      name: true,
      brand: true,
      category: true,
    },
    orderBy: { ean: "asc" },
  });

  const counts = new Map<string, number>();

  for (const product of products) {
    const sourceTerms = [product.name, product.brand, product.category].filter((entry): entry is string => Boolean(entry));

    for (const term of expandIngestionQueryTerms(sourceTerms)) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es"))
    .map(([term]) => term)
    .slice(0, limit);
}

export async function resolveIngestionQueryTerms({
  slug,
  queryTerms,
  limit,
  strategy = "peer",
}: ResolveIngestionQueryTermsOptions) {
  const cappedLimit = Math.max(limit ?? DEFAULT_SEARCH_TERMS.length, 1);

  if (queryTerms?.length) {
    return expandIngestionQueryTerms(queryTerms).slice(0, cappedLimit);
  }

  if (strategy === "legacy" && slug === "disco") {
    return DEFAULT_SEARCH_TERMS.slice(0, cappedLimit);
  }

  const catalogTerms = await buildCatalogDrivenTerms(cappedLimit);
  return Array.from(new Set([...catalogTerms, ...DEFAULT_SEARCH_TERMS])).slice(0, cappedLimit);
}