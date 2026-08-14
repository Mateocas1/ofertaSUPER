import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { unstable_doesMiddlewareMatch } from "next/dist/experimental/testing/server/middleware-testing-utils";

const proxySource = readFile(new URL("../src/proxy.ts", import.meta.url), "utf8");

async function getProxyMatchers() {
  const source = await proxySource;
  const matcher = source.match(/matcher:\s*(\[[^\]]+\])/);

  if (matcher === null) {
    throw new Error("Proxy matcher is missing");
  }

  return JSON.parse(matcher[1]) as string[];
}

test("Proxy preserves the existing admin and admin API route patterns", async () => {
  const matcher = await getProxyMatchers();

  assert.deepEqual(matcher, ["/admin(.*)", "/api/admin(.*)"]);
  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/admin" }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/admin/users" }), true);
  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/api/admin/products" }), true);
});

test("Proxy delegates authorized and unauthorized admin decisions to Clerk", async () => {
  const source = await proxySource;

  assert.match(source, /export default clerkMiddleware\(async \(auth\) => \{\s*await auth\.protect\(\);\s*\}\);/);
});

test("Proxy leaves public catalog routes outside the protected matcher", async () => {
  const matcher = await getProxyMatchers();

  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/" }), false);
  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/catalog" }), false);
  assert.equal(unstable_doesMiddlewareMatch({ config: { matcher }, url: "/api/products" }), false);
});
