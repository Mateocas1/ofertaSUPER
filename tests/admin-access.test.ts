import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { canAccessAdmin } from "../src/lib/admin/access-policy";

const accessSource = readFile(new URL("../src/lib/admin/access.ts", import.meta.url), "utf8");

async function loadSignedClaimAccess() {
  const source = await accessSource;

  assert.match(source, /authState\.sessionClaims/, "signed-claim request guard not implemented");
  return import("../src/lib/admin/access");
}

describe("admin access policy", () => {
  it("denies legacy metadata and email authority sources", () => {
    const rejectedClaims = [
      { publicMetadata: { role: "admin" } },
      { privateMetadata: { role: "admin" } },
      { unsafeMetadata: { role: "admin" } },
      { email: "admin@example.com" },
      { emails: ["admin@example.com"] },
      { allowedEmails: ["admin@example.com"] },
    ];

    for (const claims of rejectedClaims) {
      assert.equal(canAccessAdmin(claims), false);
    }
  });

  it("denies an exact admin role in a legacy metadata array", () => {
    assert.equal(canAccessAdmin({ metadata: [{ role: "admin" }] }), false);
  });

  it("denies a case-variant admin role in a legacy metadata array", () => {
    assert.equal(canAccessAdmin({ metadata: [{ role: "Admin" }] }), false);
  });

  it("denies matching legacy email and allowlist inputs", () => {
    assert.equal(
      canAccessAdmin({ emails: ["admin@example.com"], allowedEmails: ["admin@example.com"] }),
      false,
    );
  });

  it("denies missing, malformed, non-string, case-variant, and non-admin claims", () => {
    const rejectedClaims = [
      undefined,
      null,
      {},
      { metadata: null },
      { metadata: "admin" },
      { metadata: [] },
      { metadata: { role: 1 } },
      { metadata: { role: ["admin"] } },
      { metadata: { role: "Admin" } },
      { metadata: { role: "ADMIN" } },
      { metadata: { role: "viewer" } },
      { metadata: { roles: ["admin"] } },
      { role: "admin" },
    ];

    for (const claims of rejectedClaims) {
      assert.equal(canAccessAdmin(claims as never), false);
    }
  });

  it("accepts only the exact signed admin claim", () => {
    assert.equal(canAccessAdmin({ metadata: { role: "admin" } }), true);
  });
});

describe("admin request access", () => {
  it("does not fetch a Clerk user or inspect legacy authority sources", async () => {
    const source = await accessSource;

    assert.doesNotMatch(source, /currentUser/);
    assert.doesNotMatch(source, /ADMIN_EMAILS/);
    assert.doesNotMatch(source, /(?:public|private|unsafe)Metadata/);
  });

  it("preserves unauthenticated page redirect behavior", async () => {
    const { evaluateAdminPageAccess } = await loadSignedClaimAccess();
    const redirectToSignIn = () => "redirected";
    const result = evaluateAdminPageAccess({
      isAuthenticated: false,
      sessionClaims: null,
      redirectToSignIn,
    } as never);

    assert.equal(result.status, "unauthenticated");
    if (result.status === "unauthenticated") {
      assert.equal(result.redirectToSignIn, redirectToSignIn);
    }
  });

  it("forbids an authenticated page request without the exact admin claim", async () => {
    const { evaluateAdminPageAccess } = await loadSignedClaimAccess();
    const result = evaluateAdminPageAccess({
      isAuthenticated: true,
      sessionClaims: { metadata: { role: "Admin" } },
    } as never);

    assert.deepEqual(result, { status: "forbidden" });
  });

  it("authorizes a page request with the exact signed admin claim", async () => {
    const { evaluateAdminPageAccess } = await loadSignedClaimAccess();
    const sessionClaims = { metadata: { role: "admin" } };
    const result = evaluateAdminPageAccess({ isAuthenticated: true, sessionClaims } as never);

    assert.deepEqual(result, { status: "authorized" });
  });

  it("returns 401 for an unauthenticated API request", async () => {
    const { evaluateAdminApiAccess } = await loadSignedClaimAccess();
    const response = evaluateAdminApiAccess({
      isAuthenticated: false,
      sessionClaims: null,
    } as never);

    assert.equal(response?.status, 401);
    assert.deepEqual(await response?.json(), { error: "Unauthorized" });
  });

  it("returns 403 for an authenticated API request without the exact admin claim", async () => {
    const { evaluateAdminApiAccess } = await loadSignedClaimAccess();
    const response = evaluateAdminApiAccess({
      isAuthenticated: true,
      sessionClaims: { unsafeMetadata: { role: "admin" } },
    } as never);

    assert.equal(response?.status, 403);
    assert.deepEqual(await response?.json(), { error: "Forbidden" });
  });

  it("continues an API request with the exact signed admin claim", async () => {
    const { evaluateAdminApiAccess } = await loadSignedClaimAccess();
    const response = evaluateAdminApiAccess({
      isAuthenticated: true,
      sessionClaims: { metadata: { role: "admin" } },
    } as never);

    assert.equal(response, null);
  });
});
