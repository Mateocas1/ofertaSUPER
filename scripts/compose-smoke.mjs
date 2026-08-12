import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { readCommandResult } from "./compose-command-result.mjs";

const compose = ["compose", "--project-name", "ofertasuper-compose-smoke", "--file", "compose.yml"];
const port = process.env.COMPOSE_WEB_PORT ?? "3300";
function docker(args, capture = false) {
  const result = spawnSync("docker", [...compose, ...args], { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  return readCommandResult(result, `docker ${args.join(" ")}`);
}
async function waitForSearch() {
  const url = `http://127.0.0.1:${port}/api/search?q=Compose%20Smoke%20Saffron&limit=1`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "x-forwarded-for": "198.51.100.7" } });
      if (response.ok) return { response, body: await response.json() };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("web search did not become ready within 60 seconds");
}

try {
  docker(["up", "--build", "--detach", "--wait", "web"]);
  const live = await fetch(`http://127.0.0.1:${port}/api/health/live`);
  assert.deepEqual(await live.json(), { status: "live" });
  const ready = await fetch(`http://127.0.0.1:${port}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), {
    status: "ready",
    components: { configuration: "ok", database: "ok", redis: "optional" },
  });
  const { response, body } = await waitForSearch();
  assert.equal(response.status, 200);
  assert.equal(body.dataSource, "database");
  assert.equal(body.degraded, false);
  assert.equal(body.items[0]?.ean, "7799999000001");
  assert.equal(body.items[0]?.name, "Compose Smoke Saffron");
  assert.ok(body.latestCheckedAt);
  assert.ok(response.headers.get("x-ratelimit-limit"));
  const cacheTtl = Number(docker(["exec", "-T", "redis", "redis-cli", "TTL", "search:v3:compose smoke saffron:1"], true));
  assert.ok(cacheTtl > 0, `expected positive search cache TTL, got ${cacheTtl}`);
  const rateKeys = docker(["exec", "-T", "redis", "redis-cli", "--scan", "--pattern", "ofertas-super:api:search:*"], true);
  assert.ok(rateKeys, "expected a Redis rate-limit key with the search prefix");
  console.log("Compose smoke passed: health probes, database provenance, fixture, Redis cache, and rate limit verified.");
} finally {
  docker(["down", "--volumes", "--remove-orphans"]);
}
