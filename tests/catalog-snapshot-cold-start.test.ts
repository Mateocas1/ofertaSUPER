import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import nextConfig from "../next.config";
import {
  CATALOG_SNAPSHOT_FILE,
  loadCatalogSnapshotFile,
  probeCatalogSnapshotFile,
  SnapshotUnavailableError,
} from "../src/lib/catalog-snapshot";
import { buildSnapshotFixture } from "./helpers/snapshot-fixture";

// Cold starts on Vercel Hobby pay Active CPU. The 51 MB snapshot used to be a
// static JSON import, which webpack inlines into a 34 MB JS chunk that every
// catalog function evaluates on boot (about 640 ms of CPU and 120 MB of heap
// locally, against about 140 ms and 52 MB for a plain file read and parse).
// The snapshot is now read from disk on first use, and the health probe only
// reads the head and tail of the file.

// The matcher Next.js applies to outputFileTracingIncludes keys
// (next/dist/build/collect-build-traces.js).
const picomatch = createRequire(join(process.cwd(), "package.json"))("next/dist/compiled/picomatch") as (
  glob: string,
  options: { dot: boolean; contains: boolean },
) => (path: string) => boolean;

const dir = mkdtempSync(join(tmpdir(), "snapshot-cold-start-"));

function writeSnapshot(name: string, content: string): string {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
}

const fixture = buildSnapshotFixture();
const PRETTY = writeSnapshot("pretty.json", JSON.stringify(fixture, null, 2));
const COMPACT = writeSnapshot("compact.json", JSON.stringify(fixture));

describe("snapshot file load", () => {
  it("reads and parses the snapshot file through the schema gate", () => {
    assert.deepEqual(loadCatalogSnapshotFile(PRETTY), fixture);
  });

  it("fails closed when the file is missing, not JSON or malformed", () => {
    assert.throws(() => loadCatalogSnapshotFile(join(dir, "missing.json")), SnapshotUnavailableError);
    assert.throws(() => loadCatalogSnapshotFile(writeSnapshot("garbage.json", "{\"schemaVersion\": 2,")), SnapshotUnavailableError);
    assert.throws(() => loadCatalogSnapshotFile(writeSnapshot("shape.json", "{\"schemaVersion\": 2}")), SnapshotUnavailableError);
  });

  it("is not a static import, so the bundler does not inline it into a JS chunk", () => {
    const source = readFileSync("src/lib/catalog-snapshot.ts", "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*catalog-snapshot\.json["']/);
  });
});

describe("snapshot health probe", () => {
  it("reads generatedAt from a pretty-printed or compact snapshot", () => {
    assert.deepEqual(probeCatalogSnapshotFile(PRETTY), { generatedAt: fixture.generatedAt });
    assert.deepEqual(probeCatalogSnapshotFile(COMPACT), { generatedAt: fixture.generatedAt });
  });

  it("agrees with a full parse of the committed snapshot", () => {
    const committed = JSON.parse(readFileSync(CATALOG_SNAPSHOT_FILE, "utf8")) as { generatedAt: string };
    assert.deepEqual(probeCatalogSnapshotFile(CATALOG_SNAPSHOT_FILE), { generatedAt: committed.generatedAt });
  });

  it("fails closed on a missing, truncated, empty or wrong-schema snapshot", () => {
    const pretty = readFileSync(PRETTY, "utf8");
    const cases = {
      missing: join(dir, "missing.json"),
      truncated: writeSnapshot("truncated.json", pretty.slice(0, pretty.lastIndexOf("\"observedAt\""))),
      empty: writeSnapshot("empty.json", ""),
      noProducts: writeSnapshot("no-products.json", JSON.stringify({ ...fixture, products: [] }, null, 2)),
      oldSchema: writeSnapshot("old-schema.json", JSON.stringify({ ...fixture, schemaVersion: 1 }, null, 2)),
      noGeneratedAt: writeSnapshot("no-generated-at.json", JSON.stringify({ ...fixture, generatedAt: undefined }, null, 2)),
      notAnObject: writeSnapshot("array.json", JSON.stringify([fixture])),
    };
    for (const [name, file] of Object.entries(cases)) {
      assert.throws(() => probeCatalogSnapshotFile(file), SnapshotUnavailableError, name);
    }
  });
});

describe("snapshot file tracing", () => {
  // Every dynamic function that reads the catalog must ship the file it reads
  // at runtime. Static and ISR routes ("/", "/sitemap.xml") are skipped by
  // Next.js includes and rely on its own trace of catalog-snapshot.ts.
  const SNAPSHOT_ROUTES = [
    "/buscar",
    "/categoria/[slug]",
    "/ofertas",
    "/producto/[ean]",
    "/api/categories",
    "/api/health/catalog",
    "/api/health/ready",
    "/api/products",
    "/api/products/[ean]",
    "/api/products/[ean]/history",
    "/api/products/batch",
    "/api/promotions",
    "/api/search",
  ];

  it("includes the snapshot file in every catalog function", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    for (const route of SNAPSHOT_ROUTES) {
      assert.deepEqual(includes[route], [`./${CATALOG_SNAPSHOT_FILE}`], route);
    }
  });

  // Next.js matches include keys with picomatch({ contains: true }), so a key
  // like "/" would ship 51 MB with every function, health and admin included.
  it("does not ship the snapshot with functions that never read it", () => {
    const includes = nextConfig.outputFileTracingIncludes ?? {};
    const matchers = Object.keys(includes).map((key) => picomatch(key, { dot: true, contains: true }));
    for (const route of ["/api/health/live", "/admin", "/admin/ingestion", "/api/admin/ingestion", "/api/admin/promotions", "/bajas/feed.xml"]) {
      assert.equal(matchers.some((matches) => matches(route)), false, route);
    }
  });
});
