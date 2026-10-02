import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseCatalogSnapshot,
  setSnapshotOverrideForTests,
  type CatalogSnapshot,
} from "../../src/lib/catalog-snapshot";

// The daily cloud refresh rewrites data/catalog-snapshot.json without running
// the test suite, so behavior tests read this committed fixture instead of the
// real data. `tests/catalog-snapshot-schema.test.ts` keeps a schema-only check
// over the real file, so a broken export still fails the build.
export const SNAPSHOT_FIXTURE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "catalog-snapshot.fixture.json",
);

export function loadSnapshotFixture(): CatalogSnapshot {
  return parseCatalogSnapshot(JSON.parse(readFileSync(SNAPSHOT_FIXTURE_PATH, "utf8")));
}

/** Installs the fixture as the snapshot every reader in this process serves. */
export function useSnapshotFixture(): CatalogSnapshot {
  const fixture = loadSnapshotFixture();
  setSnapshotOverrideForTests(fixture);
  return fixture;
}
