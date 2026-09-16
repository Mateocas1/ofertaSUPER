import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareBuild, packageBuild } from "../../scripts/build-catalog-contract";
import { test } from "node:test";
import { canonicalize, sha256 } from "../../src/lib/production-readiness/canonical";
import { createBuildContract, parseReservationSelector, validateBootstrapContract } from "../../src/lib/production-readiness/build-contract";
import { inspectBootstrapDeployment } from "../../scripts/validate-pinned-vercel-deployment";

const selector = {
  version: 2, domain: "catalog", target: "preview", scope: "all",
  deploymentId: "11111111-1111-4111-8111-111111111111",
  publicationId: "22222222-2222-4222-8222-222222222222",
  incarnation: "33333333-3333-4333-8333-333333333333",
};
const inputs = { ".next/server/app/api/search/route.js": sha256("actual packaged query"), "package-lock.json": sha256("locked dependencies") };
const expected = { platformDeploymentId: "dpl_fixture", projectId: "prj_fixture", repoId: "123", ref: "proof/preview", commitSha: "a".repeat(40) };
const metadata = {
  id: expected.platformDeploymentId, projectId: expected.projectId, target: "preview", readyState: "READY",
  gitSource: { type: "github", repoId: 123, ref: expected.ref, sha: expected.commitSha },
};
const contract = () => createBuildContract(selector, inputs);
const check = (overrides = {}) => {
  const packaged = contract();
  return validateBootstrapContract({ reservation: selector, packaged, expectedBuildDigest: sha256(canonicalize(packaged)), metadata, expected, ...overrides });
};

test("selector v2 reserves domain UUIDs without circular release or authority claims", () => {
  assert.deepEqual(parseReservationSelector(selector), selector);
  for (const patch of [{ version: 1 }, { deploymentId: "dpl_fixture" }, { incarnation: "latest" },
    { commitSha: expected.commitSha }, { candidateDigest: sha256("future candidate") }, { provenance: metadata }, { active: true }]) {
    assert.throws(() => parseReservationSelector({ ...selector, ...patch }));
  }
  const parsed = parseReservationSelector(selector);
  assert.ok(Object.isFrozen(parsed));
});

test("packaged bytes bind queries and reserve identity but never confer active authority", () => {
  const packaged = contract();
  assert.deepEqual(packaged.inputs, inputs);
  assert.ok(Object.isFrozen(packaged.inputs));
  assert.equal(check().active, false);
  assert.equal(check().status, "bootstrap-verified");
  assert.equal(check().commitSha, expected.commitSha);
  assert.throws(() => createBuildContract(selector, {}));
  assert.throws(() => createBuildContract(selector, { "package-lock.json": sha256("no queries") }));
  assert.throws(() => createBuildContract(selector, { "../mutable": sha256("x") }));
  assert.throws(() => createBuildContract(selector, { ".next/catalog-build-contract.json": sha256("self") }));
  assert.throws(() => check({ packaged: { ...packaged, commitSha: expected.commitSha } }));
  assert.throws(() => check({ packaged: { ...packaged, inputs: { ...inputs, "package-lock.json": sha256("changed") } } }));
  assert.throws(() => check({ reservation: { ...selector, scope: "other" } }));
  for (const key of ["deploymentId", "publicationId", "incarnation"] as const) {
    assert.throws(() => check({ reservation: { ...selector, [key]: "44444444-4444-4444-8444-444444444444" } }));
  }
  assert.throws(() => check({ packaged: { ...packaged, active: true } }));
  assert.throws(() => check({ packaged: { ...packaged, candidateDigest: sha256("circular") } }));
  assert.throws(() => check({ packaged: createBuildContract(null, inputs) }));
});

test("platform-origin provenance is required, not caller meta or environment SHA", () => {
  for (const patch of [{ gitSource: undefined, meta: { githubCommitSha: expected.commitSha } },
    { id: selector.deploymentId }, { projectId: "prj_other" }, { target: "production" }, { target: null },
    { readyState: "BUILDING" }, { gitSource: { ...metadata.gitSource, sha: "b".repeat(40) } }]) {
    assert.throws(() => check({ metadata: { ...metadata, ...patch } }), /provenance/);
  }
});

test("bootstrap inspection is read-only and cannot enter the active promotion guard", async () => {
  const calls: string[][] = [];
  const packaged = contract();
  const result = await inspectBootstrapDeployment({ url: "fixture.vercel.app", scope: "team_fixture",
    reservation: selector, packaged, expectedBuildDigest: sha256(canonicalize(packaged)), expected }, async (command) => {
    calls.push(command.args);
    return { code: 0, stdout: JSON.stringify(metadata) };
  });
  assert.equal(result.active, false);
  assert.deepEqual(calls, [["inspect", "fixture.vercel.app", "--scope", "team_fixture", "--json", "--non-interactive"]]);
});

test("build packaging captures prebuild selector once and hashes actual query output", () => {
  const root = mkdtempSync(join(tmpdir(), "u10-build-"));
  try {
    mkdirSync(join(root, ".next/server"), { recursive: true });
    writeFileSync(join(root, ".next/server/query.js"), "query one");
    writeFileSync(join(root, "package-lock.json"), "locked versions");
    prepareBuild(root, JSON.stringify(selector));
    assert.throws(() => packageBuild(root), /ENOENT/);
    for (const dependency of ["next", "react", "react-dom", "@prisma/client"]) {
      mkdirSync(join(root, "node_modules", dependency), { recursive: true });
      writeFileSync(join(root, "node_modules", dependency, "package.json"), '{"version":"1.0.0"}');
    }
    const first = packageBuild(root);
    assert.equal(first.selector?.deploymentId, selector.deploymentId);
    assert.equal(first.inputs[".next/server/query.js"], sha256("query one"));
    assert.deepEqual(packageBuild(root), first);
    writeFileSync(join(root, ".next/server/query.js"), "query two");
    assert.notDeepEqual(packageBuild(root), first);
    assert.throws(() => prepareBuild(root, JSON.stringify({ ...selector, commitSha: expected.commitSha })));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("authorized redacted preview metadata cannot enable a missing packaged provenance proof", { skip: !process.env.U10_PREVIEW_FIXTURE }, () => {
  const fixture = JSON.parse(readFileSync(process.env.U10_PREVIEW_FIXTURE!, "utf8"));
  assert.match(fixture.metadataDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fixture.metadata.target, "preview");
  assert.equal(fixture.metadata.readyState, "READY");
  assert.equal(fixture.gitSourcePresent, false);
  assert.equal(fixture.packagedContractPresent, false);
  assert.throws(() => check({ metadata: fixture.metadata }), /provenance/);
  assert.equal(check().active, false);
  const packaged = contract();
  assert.throws(() => check({ packaged: { ...packaged, inputs: { ...inputs, "package-lock.json": fixture.metadataDigest } } }), /Packaged contract mismatch/);
});

test("clean build sidecar reproduces actual packaged bytes without claiming remote authority", { skip: !process.env.U10_PACKAGED_CONTRACT }, () => {
  const bytes = readFileSync(process.env.U10_PACKAGED_CONTRACT!, "utf8");
  const packaged = JSON.parse(bytes);
  assert.equal(canonicalize(createBuildContract(packaged.selector, packaged.inputs)), bytes);
  assert.ok(Object.keys(packaged.inputs).length > 5);
  for (const [path, digest] of Object.entries(packaged.inputs)) {
    assert.equal(`sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`, digest);
  }
  assert.equal(readFileSync(".next/standalone/.next/catalog-build-contract.json", "utf8"), bytes);
  assert.equal(packaged.selector, null);
  assert.throws(() => check({ packaged, expectedBuildDigest: sha256(bytes) }), /Packaged contract mismatch/);
});
