import { readFileSync } from "node:fs";

import { runProductionCatalog } from "../src/lib/production-readiness/runner";

const fixturePath = "tests/fixtures/production-catalog-run.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { authority: unknown };
const result = runProductionCatalog({ argv: process.argv.slice(2), environment: process.env, authority: fixture.authority as never });
process.stdout.write(`${JSON.stringify(result)}\n`);
