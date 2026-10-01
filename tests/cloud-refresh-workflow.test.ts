import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

const workflow = read(".github/workflows/daily-refresh.yml");
const dbState = read("scripts/db-state.sh");

describe("cloud refresh workflow contract", () => {
  it("runs on the daily schedule and on manual dry runs", () => {
    assert.match(workflow, /schedule:[\s\S]*?- cron: "0 10 \* \* \*"/);
    assert.match(workflow, /workflow_dispatch:[\s\S]*dry_run:[\s\S]*type: boolean/);
  });

  it("serializes writers and grants only the needed permissions", () => {
    assert.match(workflow, /concurrency:\s*\n\s*group: daily-refresh\s*\n\s*cancel-in-progress: false/);
    assert.match(workflow, /permissions:\s*\n\s*contents: write\s*\n\s*issues: write/);
    assert.match(workflow, /timeout-minutes: 60/);
  });

  it("uses a healthy Postgres 16 service container", () => {
    assert.match(workflow, /services:[\s\S]*postgres:16-bookworm/);
    assert.match(workflow, /--health-cmd "pg_isready -U ofertasuper_owner -d ofertasuper"/);
  });

  it("pins every action to a full commit SHA", () => {
    const usesLines = workflow.split("\n").filter((line) => /^\s*uses:/.test(line));
    assert.ok(usesLines.length >= 2, "expected at least two action steps");
    for (const line of usesLines) {
      assert.match(line, /uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40}(?: # v[\d.]+)?$/, `unpinned action: ${line.trim()}`);
    }
  });

  it("takes the Node version from .nvmrc", () => {
    assert.match(workflow, /node-version-file: \.nvmrc/);
    assert.equal(read(".nvmrc").trim(), "22");
  });

  it("restores, migrates and refreshes through the shared scripts and gates", () => {
    assert.match(workflow, /scripts\/db-state\.sh download "\$RUNNER_TEMP\/state"/);
    assert.match(workflow, /scripts\/db-state\.sh restore "\$STATE_DUMP"/);
    assert.match(workflow, /npx prisma migrate deploy/);
    assert.match(workflow, /npm run refresh:catalog/);
  });

  it("uploads the dump before committing only the snapshot", () => {
    const uploadIndex = workflow.indexOf('scripts/db-state.sh upload');
    const commitIndex = workflow.indexOf('git add data/catalog-snapshot.json');
    assert.ok(uploadIndex >= 0 && commitIndex >= 0 && uploadIndex < commitIndex, "the dump must be uploaded before the snapshot push");
    assert.match(workflow, /scripts\/db-state\.sh prune/);
    assert.match(workflow, /git push origin HEAD:master/);
    assert.doesNotMatch(workflow, /git add \.(?:\s|$)/);
  });

  it("keeps the single tracking issue wired to the reporter", () => {
    assert.match(workflow, /scripts\/cloud-refresh-report\.ts resolve/);
    assert.match(workflow, /scripts\/cloud-refresh-report\.ts fail/);
    assert.match(workflow, /if: \$\{\{ failure\(\) \}\}/);
  });

  it("never prints the database URL or the password", () => {
    assert.doesNotMatch(workflow, /echo .*DATABASE_URL/);
    assert.doesNotMatch(workflow, /echo .*PGPASSWORD/);
    assert.doesNotMatch(workflow, /echo .*secrets\.GITHUB_TOKEN/);
  });
});

describe("db-state helper contract", () => {
  it("covers the full state lifecycle without printing credentials", () => {
    for (const command of ["download", "restore", "dump", "upload", "prune"]) {
      assert.match(dbState, new RegExp(`^\\s*${command}\\)`, "m"), `missing subcommand ${command}`);
    }
    assert.match(dbState, /pg_restore --no-owner --no-acl/);
    assert.match(dbState, /pg_dump -Fc --no-owner --no-acl/);
    assert.match(dbState, /gh release download "\$RELEASE_TAG"/);
    assert.match(dbState, /gh release upload "\$RELEASE_TAG"/);
    assert.match(dbState, /gh release delete-asset "\$RELEASE_TAG"/);
    assert.match(dbState, /ASSET_REGEX='\^ofertasuper-\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\\\.dump\$'/);
  });

  it("fails closed with greppable reasons when the state is missing", () => {
    assert.match(dbState, /NO_STATE_RELEASE/);
    assert.match(dbState, /NO_STATE_ASSET/);
    assert.match(dbState, /"NO_STATE_RELEASE" "release \$RELEASE_TAG not found or not readable" 2/);
    assert.doesNotMatch(dbState, /echo .*DATABASE_URL/);
  });
});
