import { readFileSync } from "node:fs";

import { evaluateProductionGate, type GateInput } from "../src/lib/production-readiness/policy";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--fixture" || args[1] !== "tests/fixtures/production-gate.json") throw new Error("only the canonical data-only fixture is allowed");
const fixture = JSON.parse(readFileSync(args[1], "utf8")) as { input: GateInput; expected: { allowed: boolean; stage: string } };
const result = evaluateProductionGate(fixture.input);
if (result.allowed !== fixture.expected.allowed || result.stage !== fixture.expected.stage) throw new Error("fixture result did not match its deterministic expectation");
process.stdout.write(`${JSON.stringify({ allowed: result.allowed, stage: result.stage, reasons: result.reasons })}\n`);
