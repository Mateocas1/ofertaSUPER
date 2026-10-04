import { readFile } from "node:fs/promises";

import { buildDiscoveryPlan, parseCategoryTree, parseDiscoveryConfig, type CategoryTreeNode } from "../../src/lib/discovery/category-plan";
import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { fetchCotoCategoryTree } from "../../src/lib/coto/client";
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
  /** Discovered batches only: VTEX category path searched before the term. */
  categoryPath?: string;
};

export type RefreshPlanResolution = {
  mode: "discovered" | "fallback";
  batches: RefreshPlanBatch[];
  reason: string | null;
  categoriesConsidered: number;
  departmentsMatched: number;
  truncated: boolean;
  rotation: { dayIndex: number; windowDays: number };
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

// One UTC-day number drives the rotation, so two runs on the same UTC date
// always build the same plan and a new day shifts every department's children.
export function utcRotationDay(now: Date) {
  return Math.max(0, Math.floor(now.getTime() / 86_400_000));
}

// The batch id carries the plan mode (`d` discovered, `f` fallback): a same-day
// flip between the two must never collide with the other plan's checkpoints.
export function refreshBatchId(stamp: string, mode: RefreshPlanResolution["mode"], ordinal: number) {
  return `v1-refresh-${stamp}-${mode === "discovered" ? "d" : "f"}-${String(ordinal).padStart(2, "0")}`;
}

async function discoverRefreshPlan({
  read,
  fetchTree,
  baseUrlFor,
  configPath,
  rotationDay,
}: {
  read: (path: string) => Promise<string>;
  fetchTree: (args: { source: string; baseUrl: string }) => Promise<unknown>;
  baseUrlFor: (source: string) => string;
  configPath: string;
  rotationDay: number;
}): Promise<RefreshPlanResolution> {
  const config = parseDiscoveryConfig(JSON.parse(await read(configPath)));
  const treesBySource: Record<string, CategoryTreeNode[]> = {};
  for (const source of Object.keys(config.departments)) {
    if (!isSupportedSource(source)) {
      throw new Error(`source ${source} is not an acquisition source`);
    }
    treesBySource[source] = parseCategoryTree(await fetchTree({ source, baseUrl: baseUrlFor(source) }));
  }
  const plan = buildDiscoveryPlan({ config, treesBySource, rotationDay });
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
    rotation: plan.rotation,
  };
}

function refreshPlanDependencies(dependencies: ResolveRefreshPlanDependencies) {
  return {
    read: dependencies.readFile ?? ((path: string) => readFile(path, "utf8")),
    // Coto is not VTEX: its tree comes from its own search (Constructor.io).
    fetchTree: dependencies.fetchTree ?? ((args: { source: string; baseUrl: string }) =>
      args.source === "coto" ? fetchCotoCategoryTree() : fetchVtexCategoryTree({ baseUrl: args.baseUrl })),
    baseUrlFor: dependencies.baseUrlFor ?? ((source: string) => getSupermarketBySlug(source).baseUrl),
  };
}

export async function resolveRefreshPlan({
  configPath = DISCOVERY_CONFIG_PATH,
  frozenPlanPath = FALLBACK_PLAN_PATH,
  now = new Date(),
  dependencies = {},
}: {
  configPath?: string;
  frozenPlanPath?: string;
  now?: Date;
  dependencies?: ResolveRefreshPlanDependencies;
} = {}): Promise<RefreshPlanResolution> {
  const { read, fetchTree, baseUrlFor } = refreshPlanDependencies(dependencies);

  const fallback = async (reason: string): Promise<RefreshPlanResolution> => {
    const batches = parseFrozenPlan(JSON.parse(await read(frozenPlanPath)));
    return { mode: "fallback", batches, reason, categoriesConsidered: 0, departmentsMatched: 0, truncated: false, rotation: { dayIndex: utcRotationDay(now), windowDays: 0 } };
  };

  try {
    return await discoverRefreshPlan({ read, fetchTree, baseUrlFor, configPath, rotationDay: utcRotationDay(now) });
  } catch (error) {
    return fallback(error instanceof Error ? error.message : String(error));
  }
}
