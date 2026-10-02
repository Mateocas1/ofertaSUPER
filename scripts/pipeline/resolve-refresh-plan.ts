import { readFile } from "node:fs/promises";

import { buildDiscoveryPlan, parseCategoryTree, parseDiscoveryConfig, type CategoryTreeNode } from "../../src/lib/discovery/category-plan";
import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { fetchVtexCategoryTree } from "../../src/lib/vtex/category-tree";
import { CMVP_CATALOG_SOURCES } from "./cmvp-catalog-batch";

// The refresh plan for a run is either discovered from the stores' live
// category trees or, when discovery fails for any reason, the frozen plan kept
// in the repository. The caller only has to log the mode and walk the batches:
// both shapes carry the same fields. Discovered batches have no expected GTINs
// (nobody knows today's catalog in advance) and their count comes from the
// discovery config.

export const DISCOVERY_CONFIG_PATH = "config/catalog-discovery.json";
export const FALLBACK_PLAN_PATH = "artifacts/cmvp/catalog/expansion-20260920-discovery-25/acquisition-plan-cycle2.json";

export type RefreshPlanBatch = {
  ordinal: number;
  source: string;
  term: string;
  count: number;
  expectedGtins: string[];
};

export type RefreshPlanResolution = {
  mode: "discovered" | "fallback";
  batches: RefreshPlanBatch[];
  reason: string | null;
  categoriesConsidered: number;
  departmentsMatched: number;
  truncated: boolean;
};

export type ResolveRefreshPlanDependencies = {
  readFile?: (path: string) => Promise<string>;
  fetchTree?: (args: { source: string; baseUrl: string }) => Promise<unknown>;
  baseUrlFor?: (source: string) => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseFrozenBatch(entry: unknown, index: number): RefreshPlanBatch {
  if (!isRecord(entry)) {
    throw new Error(`invalid frozen plan: batch ${index} must be an object`);
  }
  const { ordinal, source, term, count, expectedGtins } = entry;
  const malformed =
    !Number.isInteger(ordinal) ||
    !isNonBlankString(source) ||
    !isNonBlankString(term) ||
    !Number.isInteger(count) ||
    (count as number) < 1 ||
    !Array.isArray(expectedGtins);
  if (malformed) {
    throw new Error(`invalid frozen plan: batch ${index} is malformed`);
  }
  return {
    ordinal: ordinal as number,
    source,
    term,
    count: count as number,
    expectedGtins: expectedGtins.map((gtin) => String(gtin)),
  };
}

export function parseFrozenPlan(payload: unknown): RefreshPlanBatch[] {
  const batches = (payload as { batches?: unknown } | null)?.batches;
  if (!Array.isArray(batches) || batches.length === 0) {
    throw new Error("invalid frozen plan: batches must be a non-empty array");
  }
  return batches.map(parseFrozenBatch);
}

function isSupportedSource(source: string): boolean {
  return (CMVP_CATALOG_SOURCES as readonly string[]).includes(source);
}

async function discoverRefreshPlan({
  read,
  fetchTree,
  baseUrlFor,
  configPath,
}: {
  read: (path: string) => Promise<string>;
  fetchTree: (args: { source: string; baseUrl: string }) => Promise<unknown>;
  baseUrlFor: (source: string) => string;
  configPath: string;
}): Promise<RefreshPlanResolution> {
  const config = parseDiscoveryConfig(JSON.parse(await read(configPath)));
  const treesBySource: Record<string, CategoryTreeNode[]> = {};
  for (const source of Object.keys(config.departments)) {
    if (!isSupportedSource(source)) {
      throw new Error(`source ${source} is not an acquisition source`);
    }
    treesBySource[source] = parseCategoryTree(await fetchTree({ source, baseUrl: baseUrlFor(source) }));
  }
  const plan = buildDiscoveryPlan({ config, treesBySource });
  if (plan.batches.length === 0) {
    throw new Error("discovery matched no allowlisted category");
  }
  return {
    mode: "discovered",
    batches: plan.batches.map((batch) => ({ ...batch, expectedGtins: [] })),
    reason: null,
    categoriesConsidered: plan.categoriesConsidered,
    departmentsMatched: plan.departmentsMatched,
    truncated: plan.truncated,
  };
}

export async function resolveRefreshPlan({
  configPath = DISCOVERY_CONFIG_PATH,
  frozenPlanPath = FALLBACK_PLAN_PATH,
  dependencies = {},
}: {
  configPath?: string;
  frozenPlanPath?: string;
  dependencies?: ResolveRefreshPlanDependencies;
} = {}): Promise<RefreshPlanResolution> {
  const read = dependencies.readFile ?? ((path: string) => readFile(path, "utf8"));
  const fetchTree = dependencies.fetchTree ?? ((args: { source: string; baseUrl: string }) => fetchVtexCategoryTree({ baseUrl: args.baseUrl }));
  const baseUrlFor = dependencies.baseUrlFor ?? ((source: string) => getSupermarketBySlug(source).baseUrl);

  const fallback = async (reason: string): Promise<RefreshPlanResolution> => {
    const batches = parseFrozenPlan(JSON.parse(await read(frozenPlanPath)));
    return { mode: "fallback", batches, reason, categoriesConsidered: 0, departmentsMatched: 0, truncated: false };
  };

  try {
    return await discoverRefreshPlan({ read, fetchTree, baseUrlFor, configPath });
  } catch (error) {
    return fallback(error instanceof Error ? error.message : String(error));
  }
}
