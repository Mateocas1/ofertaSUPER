import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { observationInstantFor } from "../scripts/pipeline/reconcile";

const acquired = new Date("2026-09-18T12:00:00.000Z");
const processed = new Date("2026-09-21T09:30:00.000Z");

describe("reconcile observation instant", () => {
  it("keeps the acquisition date when the row is processed days later", () => {
    assert.equal(
      observationInstantFor({ acquiredAt: acquired }, processed).toISOString(),
      "2026-09-18T12:00:00.000Z",
    );
  });

  it("cannot move the date when the same staging row is reprocessed later", () => {
    const first = observationInstantFor({ acquiredAt: acquired }, processed);
    const replay = observationInstantFor({ acquiredAt: acquired }, new Date("2026-09-27T00:00:00.000Z"));

    assert.equal(replay.getTime(), first.getTime());
    assert.notEqual(replay.getTime(), processed.getTime());
  });

  it("falls back to processing time only when no acquisition time exists", () => {
    assert.equal(
      observationInstantFor({}, processed).toISOString(),
      "2026-09-21T09:30:00.000Z",
    );
    assert.equal(
      observationInstantFor({ acquiredAt: null }, processed).toISOString(),
      "2026-09-21T09:30:00.000Z",
    );
  });
});
