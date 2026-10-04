// Runtime category discovery (#547): instead of replaying a frozen plan of
// terms, the daily refresh asks each VTEX store for its public category tree
// and turns the allowlisted grocery departments into search batches. Each
// department is searched through its direct children (its subcategories),
// interleaved round-robin so the quota samples every allowlisted department.
// The module is pure and deterministic so the same tree always yields the same
// plan; the HTTP read lives in `src/lib/vtex/category-tree.ts`.
//
// The cap is a hard ceiling, not a target: `maxBatchesPerRun` budgets how many
// searches one refresh may send (`resultsPerBatch` bounds each one) so the
// cloud job stays far below its 60-minute timeout.

export const MAX_BATCHES_PER_RUN = 60;
export const MAX_RESULTS_PER_BATCH = 50;

export type CategoryTreeNode = {
  id: number;
  name: string;
  hasChildren: boolean;
  children: CategoryTreeNode[];
};

export type DiscoveryConfig = {
  schemaVersion: 1;
  maxBatchesPerRun: number;
  resultsPerBatch: number;
  /** Store slug -> normalized allowlisted department names. */
  departments: Record<string, string[]>;
};

export type DiscoveredBatch = {
  ordinal: number;
  source: string;
  term: string;
  count: number;
};

export type DiscoveryPlan = {
  sources: string[];
  batches: DiscoveredBatch[];
  truncated: boolean;
  /** Raw child category nodes seen across matched departments. */
  categoriesConsidered: number;
  departmentsMatched: number;
  /** UTC-day rotation: which day this plan is, and its worst-case coverage window. */
  rotation: { dayIndex: number; windowDays: number };
};

export type CollectedCategoryTerms = {
  /** Deduplicated candidate terms in tree order (flat view). */
  terms: string[];
  /** One group per matched department, in tree order, deduplicated within it. */
  byDepartment: string[][];
  /** Raw child category nodes considered, before deduplication. */
  categoriesConsidered: number;
  departmentsMatched: number;
};

// One folding rule for both the allowlist key and the search term: lowercase,
// strip accents and punctuation, collapse whitespace. It mirrors
// `normalizeQueryTerm` in the ingestion path so a category name and its search
// behave identically.
export function normalizeCategoryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCategoryNode(value: unknown): CategoryTreeNode {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("malformed category tree node");
  }
  const node = value as Record<string, unknown>;
  if (!Number.isInteger(node.id) || typeof node.name !== "string" || !node.name.trim()) {
    throw new Error("malformed category tree node");
  }
  const children = Array.isArray(node.children) ? node.children.map(parseCategoryNode) : [];
  return {
    id: node.id as number,
    name: node.name.trim(),
    hasChildren: node.hasChildren === true || children.length > 0,
    children,
  };
}

export function parseCategoryTree(payload: unknown): CategoryTreeNode[] {
  if (!Array.isArray(payload)) {
    throw new Error("malformed category tree payload");
  }
  return payload.map(parseCategoryNode);
}

// A department is searched by its direct children (its subcategories), which
// cover their own leaves without narrowing to a single product family. A
// department that is itself a leaf falls back to its own name.
function directChildTerms(node: CategoryTreeNode): string[] {
  const names = (node.children.length > 0 ? node.children : [node]).map((child) => normalizeCategoryName(child.name));
  return [...new Set(names.filter(Boolean))];
}

// Connectors that never narrow a search on their own. Two-letter words drop
// out by length already.
const FALLBACK_STOP_WORDS = new Set(["con", "del", "las", "los", "para", "por", "sin", "una"]);
export const MAX_FALLBACK_TERMS = 3;

// A category name is a label, not a query: "Bañaderas, Cambiadores y Pelelas"
// searched as one phrase can match nothing even though each family exists.
// When the full name comes back empty, the batch retries with its meaningful
// words one at a time, in name order. A one-word name has no fallback.
export function fallbackSearchTerms(term: string): string[] {
  const normalized = normalizeCategoryName(term);
  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 3 && !FALLBACK_STOP_WORDS.has(token) && !/^\d+$/.test(token));
  const distinct = [...new Set(tokens)].filter((token) => token !== normalized);
  return distinct.slice(0, MAX_FALLBACK_TERMS);
}

export function collectCategoryTerms(tree: CategoryTreeNode[], allowlist: string[]): CollectedCategoryTerms {
  const allowed = new Set(allowlist.map(normalizeCategoryName).filter(Boolean));
  const byDepartment: string[][] = [];
  const seen = new Set<string>();
  const terms: string[] = [];
  let categoriesConsidered = 0;
  let departmentsMatched = 0;

  for (const node of tree) {
    if (!allowed.has(normalizeCategoryName(node.name))) continue;
    departmentsMatched += 1;
    const names = directChildTerms(node);
    categoriesConsidered += node.children.length > 0 ? node.children.length : 1;
    byDepartment.push(names);
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        terms.push(name);
      }
    }
  }

  return { terms, byDepartment, categoriesConsidered, departmentsMatched };
}

// Round-robin across departments so a per-store quota samples every allowlisted
// department before doubling down on the first one.
export function interleaveCategoryTerms(byDepartment: string[][]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const depth = byDepartment.reduce((max, group) => Math.max(max, group.length), 0);

  for (let index = 0; index < depth; index += 1) {
    for (const group of byDepartment) {
      const term = group[index];
      if (!term || seen.has(term)) continue;
      seen.add(term);
      ordered.push(term);
    }
  }

  return ordered;
}

function rotate<T>(values: T[], offset: number): T[] {
  if (values.length === 0) return values;
  const shift = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(shift), ...values.slice(0, shift)];
}

// Every child of every allowlisted department must be searched within a bounded
// number of days, so the plan rotates deterministically by UTC day: the
// department order shifts (every department reaches a slot even when the quota
// is below the department count) and each department's own children shift
// inside it. A specific child reappears at most `windowDays` later.
export function rotateCategoryPlan(byDepartment: string[][], rotationDay: number) {
  return rotate(byDepartment, rotationDay).map((group) => rotate(group, rotationDay));
}

// The cap is split evenly across the configured stores; earlier stores take the
// remainder. A store with fewer categories than its quota simply contributes
// fewer batches (the plan never pads). Ordinals keep the daily batch ids stable
// for a given tree.
export function buildDiscoveryPlan({
  config,
  treesBySource,
  rotationDay = 0,
}: {
  config: DiscoveryConfig;
  treesBySource: Record<string, CategoryTreeNode[]>;
  /** UTC day number; shifts the sampled children so the plan covers the tree over time. */
  rotationDay?: number;
}): DiscoveryPlan {
  const sources = Object.keys(config.departments);
  const cap = Math.min(config.maxBatchesPerRun, MAX_BATCHES_PER_RUN);
  const perSource = Math.floor(cap / sources.length);
  const remainder = cap % sources.length;
  const dayIndex = Math.max(0, Math.floor(rotationDay));
  const batches: DiscoveredBatch[] = [];
  let ordinal = 1;
  let truncated = false;
  let categoriesConsidered = 0;
  let departmentsMatched = 0;
  let windowDays = 0;

  sources.forEach((source, index) => {
    const limit = perSource + (index < remainder ? 1 : 0);
    const collected = collectCategoryTerms(treesBySource[source] ?? [], config.departments[source] ?? []);
    categoriesConsidered += collected.categoriesConsidered;
    departmentsMatched += collected.departmentsMatched;
    windowDays = Math.max(windowDays, ...collected.byDepartment.map((group) => group.length), 0);
    const ordered = interleaveCategoryTerms(rotateCategoryPlan(collected.byDepartment, dayIndex));
    if (ordered.length > limit) truncated = true;
    for (const term of ordered.slice(0, limit)) {
      batches.push({ ordinal, source, term, count: config.resultsPerBatch });
      ordinal += 1;
    }
  });

  return { sources, batches, truncated, categoriesConsidered, departmentsMatched, rotation: { dayIndex, windowDays } };
}

function requireInteger(value: unknown, label: string, max: number) {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) {
    throw new Error(`invalid discovery config: ${label} must be an integer from 1 through ${max}`);
  }
  return value as number;
}

function parseDepartments(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid discovery config: departments must be an object");
  }
  const departments: Record<string, string[]> = {};
  for (const [rawSlug, rawNames] of Object.entries(value as Record<string, unknown>)) {
    const slug = rawSlug.trim().toLowerCase();
    if (!slug) {
      throw new Error("invalid discovery config: department keys must be nonblank store slugs");
    }
    if (!Array.isArray(rawNames) || rawNames.length === 0) {
      throw new Error(`invalid discovery config: ${slug} must list at least one department`);
    }
    const names = rawNames.map((name) => {
      if (typeof name !== "string") {
        throw new Error(`invalid discovery config: ${slug} departments must be strings`);
      }
      return normalizeCategoryName(name);
    });
    if (names.some((name) => !name)) {
      throw new Error(`invalid discovery config: ${slug} departments must be nonblank names`);
    }
    departments[slug] = names;
  }
  if (Object.keys(departments).length === 0) {
    throw new Error("invalid discovery config: departments must not be empty");
  }
  return departments;
}

export function parseDiscoveryConfig(payload: unknown): DiscoveryConfig {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("invalid discovery config: payload must be an object");
  }
  const record = payload as Record<string, unknown>;
  if (record.schemaVersion !== 1) {
    throw new Error("invalid discovery config: unsupported schemaVersion");
  }
  return {
    schemaVersion: 1,
    maxBatchesPerRun: requireInteger(record.maxBatchesPerRun, "maxBatchesPerRun", MAX_BATCHES_PER_RUN),
    resultsPerBatch: requireInteger(record.resultsPerBatch, "resultsPerBatch", MAX_RESULTS_PER_BATCH),
    departments: parseDepartments(record.departments),
  };
}
