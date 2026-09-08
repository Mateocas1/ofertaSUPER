import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { runGuardCommand, validatePinnedDeployment, type GuardCommand, type GuardOptions } from "../scripts/validate-pinned-vercel-deployment";

const fingerprint = {
  publicationId: "pub-1", promotionId: "promotion-1", target: "production" as const,
  deploymentId: "domain-deployment-1", commitSha: "a".repeat(40),
  candidateDigest: `sha256:${"b".repeat(64)}`, verifiedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
};
const options: GuardOptions = {
  deploymentId: "dpl_immutable123", projectId: "prj_expected", scope: "team-slug",
  commitSha: fingerprint.commitSha, fingerprint, promote: false,
};
const metadata = { id: options.deploymentId, projectId: options.projectId, readyState: "READY", url: "app-abc123.vercel.app", meta: { githubCommitSha: options.commitSha } };

function harness(overrides: Partial<{ metadata: unknown; proof: unknown; proofCode: number; promoteCode: number }> = {}) {
  const calls: GuardCommand[] = [];
  const run = async (command: GuardCommand) => {
    calls.push(command);
    if (command.kind === "metadata") return { code: 0, stdout: JSON.stringify(Object.hasOwn(overrides, "metadata") ? overrides.metadata : metadata) };
    if (command.kind === "proof") return { code: overrides.proofCode ?? 0, httpStatus: 200, stdout: JSON.stringify(overrides.proof ?? { active: true, nonce: command.nonce, fingerprint }) };
    return { code: overrides.promoteCode ?? 0, stdout: "" };
  };
  return { calls, run };
}

describe("pinned Vercel deployment guard", () => {
  it("validates only by default and keeps the bearer secret out of argv", async () => {
    const h = harness();
    const result = await validatePinnedDeployment(options, { run: h.run, secret: "machine-secret" });
    assert.deepEqual(result, { status: "validated", promotionAttempts: 0 });
    assert.equal(h.calls.length, 2);
    const proof = h.calls[1];
    assert.equal(proof.kind, "proof");
    assert.doesNotMatch(JSON.stringify(proof.args), /machine-secret/);
    assert.match(proof.stdin ?? "", /Bearer machine-secret/);
  });

  it("fails closed on metadata project, deployment, commit, readiness, and URL violations", async () => {
    const cases = [
      { ...metadata, id: "dpl_other" }, { ...metadata, projectId: "prj_other" },
      { ...metadata, meta: {} }, { ...metadata, meta: { githubCommitSha: "c".repeat(40) } },
      { ...metadata, readyState: "BUILDING" }, { ...metadata, url: "https://user@evil.example/path?q=1#x" }, null, [],
    ];
    for (const value of cases) {
      const h = harness({ metadata: value });
      await assert.rejects(validatePinnedDeployment(options, { run: h.run, secret: "machine-secret" }), /Deployment validation failed/);
      assert.equal(h.calls.filter((call) => call.kind === "promote").length, 0);
    }
  });

  it("rejects invalid inputs and missing secret before any process call", async () => {
    for (const [candidate, secret] of [[{ ...options, commitSha: "expected" }, "machine-secret"], [options, undefined]] as const) {
      const h = harness();
      await assert.rejects(validatePinnedDeployment(candidate, { run: h.run, secret }), /Invalid guard input/);
      assert.equal(h.calls.length, 0);
    }
  });

  it("rejects denied, inactive, malformed, non-success, nonce, and fingerprint proof failures", async () => {
    const failures: Array<{ proofCode?: number; proofStatus?: number; proof?: unknown }> = [
      { proofCode: 22 }, { proofCode: 0, proofStatus: 302, proof: { active: true } }, { proof: { active: false } }, { proof: "bad" },
      { proof: { active: true, nonce: "wrong", fingerprint } },
      { proof: { active: true, nonce: "placeholder", fingerprint: { ...fingerprint, publicationId: "other" } } },
    ];
    for (const failure of failures) {
      const h = harness(failure);
      if (typeof failure.proof === "object" && failure.proof && "nonce" in failure.proof && failure.proof.nonce === "placeholder") {
        h.run = async (command) => {
          h.calls.push(command);
          if (command.kind === "metadata") return { code: 0, stdout: JSON.stringify(metadata) };
          if (command.kind === "proof") return { code: 0, httpStatus: failure.proofStatus ?? 200, stdout: JSON.stringify({ ...(failure.proof as Record<string, unknown>), nonce: command.nonce }) };
          return { code: 0, stdout: "" };
        };
      }
      if (failure.proofStatus) {
        const original = h.run;
        h.run = async (command) => command.kind === "proof"
          ? { ...(await original(command)), httpStatus: failure.proofStatus }
          : original(command);
      }
      await assert.rejects(validatePinnedDeployment(options, { run: h.run, secret: "machine-secret" }), /Proof validation failed/);
      assert.equal(h.calls.filter((call) => call.kind === "promote").length, 0);
    }
  });

  it("promotes the same ID only after a fresh full validation", async () => {
    const h = harness();
    const result = await validatePinnedDeployment({ ...options, promote: true }, { run: h.run, secret: "machine-secret" });
    assert.deepEqual(result, { status: "promoted", promotionAttempts: 1 });
    assert.deepEqual(h.calls.map((call) => call.kind), ["metadata", "proof", "promote"]);
    assert.equal(h.calls[2].args[1], options.deploymentId);
  });

  it("reports a promotion failure as one uncertain attempt without retrying", async () => {
    const h = harness({ promoteCode: 1 });
    await assert.rejects(validatePinnedDeployment({ ...options, promote: true }, { run: h.run, secret: "machine-secret" }), /Promotion failed after one attempt; remote outcome is uncertain/);
    assert.equal(h.calls.filter((call) => call.kind === "promote").length, 1);
  });

  it("keeps proof transport flags compatible and handles an early child exit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "vercel-guard-"));
    const executable = join(directory, "vercel");
    const previousPath = process.env.PATH;
    try {
      writeFileSync(executable, `#!/usr/bin/env node\nconst fs=require("node:fs");let input="";process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{fs.writeFileSync(process.env.GUARD_CAPTURE,JSON.stringify({args:process.argv.slice(2),input}));process.stdout.write('{"ok":true}\\nVERCEL_GUARD_HTTP_STATUS:200')});`);
      chmodSync(executable, 0o700);
      process.env.PATH = `${directory}:${previousPath}`;
      process.env.GUARD_CAPTURE = join(directory, "capture.json");
      const command: GuardCommand = { kind: "proof", args: ["curl", "/proof", "--", "--header", "@-"], stdin: "Authorization: Bearer machine-secret\n" };
      assert.deepEqual(await runGuardCommand(command), { code: 0, httpStatus: 200, stdout: '{"ok":true}' });
      const capture = JSON.parse(readFileSync(process.env.GUARD_CAPTURE, "utf8"));
      assert.ok(!capture.args.includes("--non-interactive")); assert.match(capture.input, /machine-secret/);

      writeFileSync(executable, "#!/usr/bin/env node\nprocess.exit(1)\n");
      const early = await runGuardCommand({ ...command, stdin: `Authorization: Bearer ${"x".repeat(200_000)}\n` });
      assert.deepEqual(early, { code: 1, stdout: "" });
    } finally {
      process.env.PATH = previousPath;
      delete process.env.GUARD_CAPTURE;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
