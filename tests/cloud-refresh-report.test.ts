import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFailureIssueBody,
  buildResolutionComment,
  classifyRefreshFailure,
  FAILURE_ISSUE_LABEL,
  FAILURE_ISSUE_MARKER,
  FAILURE_ISSUE_TITLE,
  logExcerpt,
  redactSecrets,
  selectFailureIssue,
} from "../scripts/lib/cloud-refresh-report";

describe("cloud refresh failure classification", () => {
  it("maps each stage to a stable reason", () => {
    assert.equal(classifyRefreshFailure("restore", "db-state: NO_STATE_RELEASE: release db-state not found"), "no-state-release");
    assert.equal(classifyRefreshFailure("restore", "db-state: NO_STATE_ASSET: release db-state has no asset"), "no-state-asset");
    assert.equal(classifyRefreshFailure("restore", "db-state: RESTORE_FAILED: pg_restore could not load"), "restore-failed");
    assert.equal(classifyRefreshFailure("migrate", "Error: P3009"), "migrate-failed");
    assert.equal(classifyRefreshFailure("refresh", "VTEX_HASH_UNAVAILABLE: no valid hash"), "vtex-hash-unavailable");
    assert.equal(classifyRefreshFailure("refresh", "[refresh] gate check failed: failedBatches=1"), "refresh-gate-failed");
    assert.equal(classifyRefreshFailure("refresh", "[refresh] summary: batches ok=36"), "refresh-failed");
    assert.equal(classifyRefreshFailure("upload", "db-state: UPLOAD_FAILED"), "state-upload-failed");
    assert.equal(classifyRefreshFailure("commit", "git push rejected"), "snapshot-commit-failed");
    assert.equal(classifyRefreshFailure("unknown", "whatever"), "unknown");
  });

  it("keeps the VTEX hash reason ahead of the generic gate reason", () => {
    const log = "VTEX_HASH_UNAVAILABLE: no valid VTEX persisted-query hash\n[refresh] gate check failed: failedBatches=0";

    assert.equal(classifyRefreshFailure("refresh", log), "vtex-hash-unavailable");
  });

  it("names the two rejection-rule failures specifically", () => {
    const exceeded = '[refresh] failures: [{"batchId":"v1-refresh-20261002-28","error":"acquisition_rejected_products"}]\n[refresh] gate check failed: failedBatches=1';
    const admittedNothing = '[refresh] failures: [{"error":"acquisition_no_admitted_products"}]\n[refresh] gate check failed: failedBatches=1';

    assert.equal(classifyRefreshFailure("refresh", exceeded), "refresh-rejections-exceeded");
    assert.equal(classifyRefreshFailure("refresh", admittedNothing), "refresh-no-admitted-products");
  });

  it("does not mistake a tolerated rejection line for a hard failure", () => {
    const tolerated = '[refresh] rejected: 1 products [{"batchId":"v1-refresh-20261002-28","gtin":"07790000000007","qualityFlags":["price_no_spike"]}]';

    assert.equal(classifyRefreshFailure("refresh", tolerated), "refresh-failed");
  });
});

describe("cloud refresh secret redaction", () => {
  it("redacts connection strings and secret assignments", () => {
    const input = [
      "Error: can't reach database server at postgresql://ofertasuper_owner:ofertasuper-cloud@localhost:5432/ofertasuper",
      "DATABASE_URL=postgresql://user:pass@host:5432/db",
      "token: ghp_supersecret",
      "plain message stays",
    ].join("\n");

    const redacted = redactSecrets(input);

    assert.doesNotMatch(redacted, /ofertasuper-cloud/);
    assert.doesNotMatch(redacted, /user:pass@host/);
    assert.doesNotMatch(redacted, /ghp_supersecret/);
    assert.match(redacted, /plain message stays/);
    assert.equal(redacted.match(/<redacted>/g)?.length, 3);
  });

  it("keeps only the last lines of a log and redacts them", () => {
    const lines = Array.from({ length: 60 }, (_, index) => `line ${index}`);
    lines[59] = "error at postgresql://a:b@c:5432/d";

    const excerpt = logExcerpt(lines.join("\n"), 5);

    assert.equal(excerpt.split("\n").length, 5);
    assert.match(excerpt, /^line 55$/m);
    assert.match(excerpt, /error at postgresql:\/\/<redacted>/);
    assert.doesNotMatch(excerpt, /a:b@c/);
  });
});

describe("cloud refresh failure issue", () => {
  it("builds one deduplicable body with the greppable reason", () => {
    const body = buildFailureIssueBody({
      reason: "refresh-gate-failed",
      stage: "refresh",
      runUrl: "https://github.com/Mateocas1/ofertaSUPER/actions/runs/123",
      date: "2026-10-02",
      logExcerpt: "gate check failed: worstFreshness=79.6%",
    });

    assert.match(body, new RegExp(`^${FAILURE_ISSUE_MARKER}$`, "m"));
    assert.match(body, /reason: `refresh-gate-failed`/);
    assert.match(body, /stage: `refresh`/);
    assert.match(body, /date: 2026-10-02/);
    assert.match(body, /actions\/runs\/123/);
    assert.match(body, /Last output \(redacted\)/);
    assert.match(body, /worstFreshness=79\.6%/);
  });

  it("omits the log section when there is no output", () => {
    const body = buildFailureIssueBody({
      reason: "no-state-asset",
      stage: "restore",
      runUrl: "https://example.test/run",
      date: "2026-10-02",
    });

    assert.doesNotMatch(body, /Last output/);
    assert.equal(body.split(FAILURE_ISSUE_MARKER).length, 2);
  });

  it("selects the lowest-numbered open tracking issue and ignores closed ones", () => {
    assert.equal(FAILURE_ISSUE_TITLE.length > 0, true);
    assert.equal(FAILURE_ISSUE_LABEL, "refresh-failure");
    assert.equal(selectFailureIssue([]), null);
    assert.equal(selectFailureIssue([{ number: 9, title: "t", state: "CLOSED" }]), null);
    assert.deepEqual(
      selectFailureIssue([
        { number: 12, title: "t", state: "OPEN" },
        { number: 4, title: "t", state: "OPEN" },
        { number: 8, title: "t", state: "CLOSED" },
      ]),
      { number: 4, title: "t", state: "OPEN" },
    );
    assert.equal(selectFailureIssue([{ number: 3, title: "t" }])?.number, 3);
  });

  it("names the successful run when closing", () => {
    assert.match(buildResolutionComment("https://example.test/run/2"), /succeeded \(https:\/\/example\.test\/run\/2\)/);
  });
});
