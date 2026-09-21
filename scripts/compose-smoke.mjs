import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { readCommandResult } from "./compose-command-result.mjs";

const compose = ["compose", "--project-name", "ofertasuper-compose-smoke", "--file", "compose.yml"];
const port = process.env.COMPOSE_WEB_PORT ?? "3300";
function docker(args, capture = false) {
  const result = spawnSync("docker", [...compose, ...args], { encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  return readCommandResult(result, `docker ${args.join(" ")}`);
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
  const fixture = docker(["exec", "-T", "postgres", "psql", "-U", "ofertasuper_owner", "-d", "ofertasuper", "-Atc", "SELECT ean || ':' || name FROM products WHERE ean = '7799999000001'"], true);
  assert.equal(fixture, "7799999000001:Compose Smoke Saffron");
  const response = await fetch(`http://127.0.0.1:${port}/api/search?q=Compose%20Smoke%20Saffron&limit=1`, { headers: { "x-forwarded-for": "198.51.100.7" } });
  assert.equal(response.status, 503);
  assert.equal(Number(docker(["exec", "-T", "redis", "redis-cli", "DBSIZE"], true)), 0);
  console.log("Compose smoke passed: health probes, database fixture, and non-Vercel public-route rejection verified.");
} finally {
  docker(["down", "--volumes", "--remove-orphans"]);
}
