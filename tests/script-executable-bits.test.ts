import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// Workflows and the cron run these scripts directly; a missing exec bit only
// shows up as "Permission denied" on the runner. scripts/lib/ holds sourced
// helpers, which do not need it.
function shellScripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "lib" ? [] : shellScripts(path);
    return entry.name.endsWith(".sh") ? [path] : [];
  });
}

describe("shell scripts", () => {
  it("are executable", () => {
    const missing = shellScripts("scripts").filter((path) => (statSync(path).mode & 0o111) === 0);
    assert.deepEqual(missing, []);
  });
});
