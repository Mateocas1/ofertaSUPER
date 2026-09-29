import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const lib = new URL("../scripts/lib/r2-upload.sh", import.meta.url).pathname;
const SECRET = "SUPER-SECRET-VALUE";

function fixture(options: { rclone?: "ok" | "fail" | "none"; envFile?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "r2-upload-"));
  const bin = join(dir, "bin");
  mkdirSync(bin);
  if (options.rclone !== "none") {
    const exit = options.rclone === "fail" ? 1 : 0;
    writeFileSync(join(bin, "rclone"), `#!/bin/sh\necho "$@" >> "${dir}/rclone.log"\necho "${SECRET}" >&2\nexit ${exit}\n`);
    chmodSync(join(bin, "rclone"), 0o755);
  }
  const envFile = join(dir, "r2.env");
  if (options.envFile !== false) writeFileSync(envFile, `R2_REMOTE=fake\nR2_RETENTION_DAYS=3\nSECRET_TOKEN=${SECRET}\n`);
  const backup = join(dir, "ofertasuper-2026-01-02.dump");
  writeFileSync(backup, "dump");
  const run = () => {
    // System dirs stay on PATH for bash/timeout/basename; the shim dir goes first.
    const path = options.rclone === "none" ? "/usr/bin:/bin" : `${bin}:/usr/bin:/bin`;
    return spawnSync("bash", ["-c", `. "${lib}"; r2_upload_backup "${backup}"; echo "rc=$?"`], {
      encoding: "utf8",
      env: { ...process.env, PATH: path, HOME: dir, R2_ENV_FILE: envFile },
    });
  };
  const log = () => (existsSync(join(dir, "rclone.log")) ? readFileSync(join(dir, "rclone.log"), "utf8") : "");
  return { dir, backup, run, log };
}

test("uploads once, prunes with the retention window and stays idempotent", () => {
  const f = fixture();
  try {
    const first = f.run();
    assert.match(first.stdout, /r2 upload ok: ofertasuper-2026-01-02\.dump/);
    assert.match(first.stdout, /rc=0/);
    assert.match(f.log(), /copyto .*ofertasuper-2026-01-02\.dump fake:ofertasuper-2026-01-02\.dump/);
    assert.match(f.log(), /delete fake: --min-age 3d --include ofertasuper-\*\.dump/);
    assert.ok(existsSync(`${f.backup}.r2-uploaded`));
    const second = f.run();
    assert.match(second.stdout, /already uploaded today/);
    assert.equal(f.log().split("\n").filter((l) => l.startsWith("copyto")).length, 1);
    assert.doesNotMatch(first.stdout + first.stderr + second.stdout + second.stderr, new RegExp(SECRET));
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("rclone failure is logged, returns 0, leaves no marker and leaks no secret", () => {
  const f = fixture({ rclone: "fail" });
  try {
    const result = f.run();
    assert.match(result.stdout, /r2 upload failed \(copy\)/);
    assert.match(result.stdout, /rc=0/);
    assert.equal(existsSync(`${f.backup}.r2-uploaded`), false);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET));
  } finally {
    rmSync(f.dir, { recursive: true, force: true });
  }
});

test("skips with a log line when the env file or rclone is missing", () => {
  const noEnv = fixture({ envFile: false });
  const noRclone = fixture({ rclone: "none" });
  try {
    assert.match(noEnv.run().stdout, /skipped: .*r2\.env not found[\s\S]*rc=0/);
    assert.match(noRclone.run().stdout, /skipped: rclone not found[\s\S]*rc=0/);
  } finally {
    rmSync(noEnv.dir, { recursive: true, force: true });
    rmSync(noRclone.dir, { recursive: true, force: true });
  }
});

test("cron-refresh.sh wires the optional upload and extends PATH", () => {
  const script = readFileSync(new URL("../scripts/cron-refresh.sh", import.meta.url), "utf8");
  assert.match(script, /r2_upload_backup "\$BACKUP" \|\| true/);
  assert.match(script, /\/snap\/bin/);
  assert.equal(spawnSync("bash", ["-n", "scripts/cron-refresh.sh"]).status, 0);
  assert.equal(spawnSync("bash", ["-n", lib]).status, 0);
});
