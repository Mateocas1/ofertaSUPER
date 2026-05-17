import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessAdmin, parseAdminEmailAllowlist } from "../src/lib/admin/access-policy";

describe("admin access policy", () => {
  it("parses admin email allowlist case-insensitively", () => {
    assert.deepEqual(parseAdminEmailAllowlist(" mateo@example.com, Admin@Example.com\nops@example.com "), [
      "mateo@example.com",
      "admin@example.com",
      "ops@example.com",
    ]);
  });

  it("fails closed for authenticated users without an allowed email or admin role", () => {
    assert.equal(
      canAccessAdmin({
        emails: ["viewer@example.com"],
        allowedEmails: [],
        metadata: {},
      }),
      false,
    );
  });

  it("allows users whose email is present in the configured allowlist", () => {
    assert.equal(
      canAccessAdmin({
        emails: ["Mateo@Example.com"],
        allowedEmails: ["mateo@example.com"],
        metadata: {},
      }),
      true,
    );
  });

  it("allows users with an explicit admin role in Clerk metadata", () => {
    assert.equal(
      canAccessAdmin({
        emails: ["viewer@example.com"],
        allowedEmails: [],
        metadata: { role: "admin" },
      }),
      true,
    );

    assert.equal(
      canAccessAdmin({
        emails: ["viewer@example.com"],
        allowedEmails: [],
        metadata: { roles: ["viewer", "admin"] },
      }),
      true,
    );
  });
});
