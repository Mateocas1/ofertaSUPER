import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("maps a valid search request denied before its commercial load to unavailable", () => {
  const script = `
    const { NextRequest } = await import("next/server");
    const route = await import("./src/app/api/search/route.ts");
    const handler = route.GET ?? route.default.GET;
    const response = await handler(new NextRequest("http://catalog.test/api/search?q=yerba"));
    console.log(JSON.stringify({ status: response.status, body: await response.json() }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--conditions=react-server", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    status: 503,
    body: {
      error: "Catalog temporarily unavailable",
      dataSource: "unavailable",
      degraded: false,
      verifiedAt: null,
    },
  });
});
