import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getDatabaseEndpoint } from "../src/lib/catalog-availability";

describe("catalog availability preflight", () => {
  it("extracts host and port from a database URL without opening Prisma", () => {
    assert.deepEqual(getDatabaseEndpoint("postgresql://user:pass@example.supabase.com:6543/postgres"), {
      host: "example.supabase.com",
      port: 6543,
    });
  });

  it("fails closed when the database URL is missing or invalid", () => {
    assert.equal(getDatabaseEndpoint(undefined), null);
    assert.equal(getDatabaseEndpoint("not-a-url"), null);
  });
});
