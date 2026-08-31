import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diagnoseJumboSessionEnvelopes,
  type ProbeSessionResult,
  type RegionalProbeHttp,
  type SessionEnvelopeDiagnosticReport,
} from "@/lib/vtex/regional-read-probe";
import {
  executeVtexSessionEnvelopeDiagnosticCli,
  runVtexSessionEnvelopeDiagnosticCli,
} from "../scripts/diagnose-vtex-session-envelope";

const payload = (postalCode: string, regionId: unknown) => ({ namespaces: {
  public: { postalCode: { value: postalCode } }, checkout: { regionId: { value: regionId } },
} });
const fakeHttp = (responses: ProbeSessionResult[]): RegionalProbeHttp => ({
  openSession: async () => {
    const response = responses.shift();
    if (!response) throw new Error("unexpected session request");
    return response;
  },
});

test("diagnostic makes only two sequential sessions and emits the ordered fixed envelope facts", async () => {
  const calls: string[] = [];
  const http: RegionalProbeHttp = { async openSession({ postalCode, timeoutMs }) {
    calls.push(`${postalCode}:${timeoutMs}`);
    return {
      kind: "payload", payload: payload(postalCode, postalCode === "1425" ? "north" : "south"),
      requiredCookiesPresent: false,
      readCatalog: async () => { throw new Error("catalog must not be read"); },
    };
  } };
  const report = await diagnoseJumboSessionEnvelopes({ http });
  assert.deepEqual(calls, ["1425:10000", "5000:10000"]);
  assert.deepEqual(report, { schemaVersion: 1, targets: [
    { postalCode: "CP1425", rootKind: "object", facts: {
      namespacesKind: "object", namespacesPublicKind: "object", namespacesPublicPostalCodeKind: "object",
      namespacesPublicPostalCodeValueKind: "string", namespacesPublicPostalCodeValueMatchesTarget: true,
      namespacesCheckoutKind: "object", namespacesCheckoutRegionIdKind: "object",
      namespacesCheckoutRegionIdValueKind: "string", namespacesCheckoutRegionIdValueIsNonEmptyString: true,
    } },
    { postalCode: "CP5000", rootKind: "object", facts: {
      namespacesKind: "object", namespacesPublicKind: "object", namespacesPublicPostalCodeKind: "object",
      namespacesPublicPostalCodeValueKind: "string", namespacesPublicPostalCodeValueMatchesTarget: true,
      namespacesCheckoutKind: "object", namespacesCheckoutRegionIdKind: "object",
      namespacesCheckoutRegionIdValueKind: "string", namespacesCheckoutRegionIdValueIsNonEmptyString: true,
    } },
  ] });
  assert.deepEqual(Object.keys(report), ["schemaVersion", "targets"]);
  assert.deepEqual(Object.keys(report.targets[0]), ["postalCode", "rootKind", "facts"]);
  assert.deepEqual(Object.keys(report.targets[0].facts ?? {}), [
    "namespacesKind", "namespacesPublicKind", "namespacesPublicPostalCodeKind",
    "namespacesPublicPostalCodeValueKind", "namespacesPublicPostalCodeValueMatchesTarget",
    "namespacesCheckoutKind", "namespacesCheckoutRegionIdKind", "namespacesCheckoutRegionIdValueKind",
    "namespacesCheckoutRegionIdValueIsNonEmptyString",
  ]);
});

test("diagnostic fails closed for missing payloads and records only literal expected paths", async () => {
  const secret = "unread-unknown-session-value";
  const report = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "transport_error" },
    { kind: "payload", payload: { namespaces: { public: { postalCode: { value: "wrong" } }, checkout: { regionId: { value: "" } }, [secret]: secret } }, requiredCookiesPresent: true, readCatalog: null },
  ]) });
  assert.deepEqual(report.targets[0], { postalCode: "CP1425", rootKind: null, facts: null });
  assert.deepEqual(report.targets[1], { postalCode: "CP5000", rootKind: "object", facts: {
    namespacesKind: "object", namespacesPublicKind: "object", namespacesPublicPostalCodeKind: "object",
    namespacesPublicPostalCodeValueKind: "string", namespacesPublicPostalCodeValueMatchesTarget: false,
    namespacesCheckoutKind: "object", namespacesCheckoutRegionIdKind: "object",
    namespacesCheckoutRegionIdValueKind: "string", namespacesCheckoutRegionIdValueIsNonEmptyString: false,
  } });
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test("diagnostic reports finite JSON kinds and cancellation before a later session", async () => {
  const controller = new AbortController(); let calls = 0;
  const http: RegionalProbeHttp = { async openSession() {
    calls += 1; controller.abort();
    return { kind: "payload", payload: Number.POSITIVE_INFINITY, requiredCookiesPresent: false, readCatalog: null };
  } };
  await assert.rejects(diagnoseJumboSessionEnvelopes({ http, signal: controller.signal }));
  assert.equal(calls, 1);
  const finite = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "payload", payload: 7, requiredCookiesPresent: false, readCatalog: null },
    { kind: "payload", payload: null, requiredCookiesPresent: false, readCatalog: null },
  ]) });
  assert.deepEqual(finite.targets.map((target) => target.rootKind), ["number", "null"]);
  assert.deepEqual(finite.targets.map((target) => target.facts?.namespacesKind), ["missing", "missing"]);
  const nonJsonNumber = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "payload", payload: Number.POSITIVE_INFINITY, requiredCookiesPresent: false, readCatalog: null },
    { kind: "payload", payload: Number.NaN, requiredCookiesPresent: false, readCatalog: null },
  ]) });
  assert.deepEqual(nonJsonNumber.targets.map((target) => target.rootKind), [null, null]);
});

const missingFacts = {
  namespacesKind: "missing", namespacesPublicKind: "missing", namespacesPublicPostalCodeKind: "missing",
  namespacesPublicPostalCodeValueKind: "missing", namespacesPublicPostalCodeValueMatchesTarget: null,
  namespacesCheckoutKind: "missing", namespacesCheckoutRegionIdKind: "missing",
  namespacesCheckoutRegionIdValueKind: "missing", namespacesCheckoutRegionIdValueIsNonEmptyString: null,
};
const invalidDiagnosticTarget = (postalCode: "CP1425" | "CP5000") => ({ postalCode, rootKind: null, facts: null });

test("diagnostic rejects non-JSON and reflective root values with exact null targets", async () => {
  class NonJson {}
  const revocable = Proxy.revocable({}, {}); revocable.revoke();
  const throwingProxy = new Proxy({}, { getPrototypeOf: () => { throw new Error("hostile prototype"); } });
  const samples: [string, unknown][] = [
    ["date", new Date()], ["map", new Map()], ["set", new Set()], ["class", new NonJson()],
    ["boxed", new Number(1)], ["function", () => undefined], ["symbol", Symbol("value")],
    ["bigint", (globalThis as { BigInt: (value: number) => unknown }).BigInt(1)], ["undefined", undefined],
    ["NaN", Number.NaN], ["infinity", Number.POSITIVE_INFINITY],
    ["throwing proxy", throwingProxy], ["revoked proxy", revocable.proxy],
  ];
  for (const [name, value] of samples) {
    const report = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
      { kind: "payload", payload: value, requiredCookiesPresent: false, readCatalog: null },
      { kind: "payload", payload: value, requiredCookiesPresent: false, readCatalog: null },
    ]) });
    assert.deepEqual(report.targets, [invalidDiagnosticTarget("CP1425"), invalidDiagnosticTarget("CP5000")], name);
  }
});

test("diagnostic fails closed when approved-path descriptors throw", async () => {
  const secret = "unread-descriptor-trap-secret";
  const descriptorTrap = (key: string) => new Proxy({}, { getPrototypeOf: () => Object.prototype,
    getOwnPropertyDescriptor: (_target, property) => { if (property === key) throw new Error(secret); return undefined; } });
  const nested = { namespaces: descriptorTrap("public") };
  const report = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "payload", payload: descriptorTrap("namespaces"), requiredCookiesPresent: false, readCatalog: null },
    { kind: "payload", payload: nested, requiredCookiesPresent: false, readCatalog: null },
  ]) });
  assert.deepEqual(report.targets, [invalidDiagnosticTarget("CP1425"), invalidDiagnosticTarget("CP5000")]);
  assert.equal(JSON.stringify(report).includes(secret), false);
});

test("diagnostic reads only own data descriptors and fails closed for repeated expected objects", async () => {
  let getterReads = 0;
  const accessorRoot = {};
  Object.defineProperty(accessorRoot, "namespaces", { enumerable: true, get: () => { getterReads += 1; throw new Error("getter"); } });
  const accessorReport = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "payload", payload: accessorRoot, requiredCookiesPresent: false, readCatalog: null },
    { kind: "payload", payload: accessorRoot, requiredCookiesPresent: false, readCatalog: null },
  ]) });
  assert.equal(getterReads, 0);
  assert.deepEqual(accessorReport.targets.map((target) => target.facts), [missingFacts, missingFacts]);

  const cyclic: { namespaces?: unknown } = {}; cyclic.namespaces = cyclic;
  const cycleReport = await diagnoseJumboSessionEnvelopes({ http: fakeHttp([
    { kind: "payload", payload: cyclic, requiredCookiesPresent: false, readCatalog: null },
    { kind: "payload", payload: cyclic, requiredCookiesPresent: false, readCatalog: null },
  ]) });
  assert.deepEqual(cycleReport.targets.map((target) => target.facts), [missingFacts, missingFacts]);

  const repeatedReport = await diagnoseJumboSessionEnvelopes({ http: { async openSession({ postalCode }) {
    const value = { value: postalCode }; const namespaces = { public: { postalCode: value }, checkout: { regionId: value } };
    return { kind: "payload", payload: { namespaces }, requiredCookiesPresent: false, readCatalog: null };
  } } });
  assert.deepEqual(repeatedReport.targets.map((target) => target.facts?.namespacesCheckoutRegionIdKind), ["missing", "missing"]);
  assert.deepEqual(repeatedReport.targets.map((target) => target.facts?.namespacesCheckoutRegionIdValueKind), ["missing", "missing"]);
});

const help = "Usage: npx tsx scripts/diagnose-vtex-session-envelope.ts\n       npx tsx scripts/diagnose-vtex-session-envelope.ts --help\n";
test("dedicated CLI accepts only no arguments or exact help and buffers injected diagnostics", async () => {
  let calls = 0;
  const operation = async (): Promise<SessionEnvelopeDiagnosticReport> => { calls += 1; return { schemaVersion: 1 as const, targets: [
    { postalCode: "CP1425" as const, rootKind: null, facts: null }, { postalCode: "CP5000" as const, rootKind: null, facts: null },
  ] }; };
  assert.deepEqual(await runVtexSessionEnvelopeDiagnosticCli([], operation, new AbortController().signal),
    { stdout: `${JSON.stringify(await operation(), null, 2)}\n`, stderr: "", exitCode: 0 });
  calls = 0;
  assert.deepEqual(await runVtexSessionEnvelopeDiagnosticCli(["--help"], operation, new AbortController().signal), { stdout: help, stderr: "", exitCode: 0 });
  for (const argv of [["--help", "x"], ["x"], ["--output=x"]]) assert.deepEqual(
    await runVtexSessionEnvelopeDiagnosticCli(argv, operation, new AbortController().signal),
    { stdout: "", stderr: "Invalid usage. Run with --help.\n", exitCode: 2 },
  );
  assert.equal(calls, 0);
});

test("CLI suppresses output on cancellation, cleans SIGINT, and sanitizes internal failures", async () => {
  const controller = new AbortController();
  const cancelled = await runVtexSessionEnvelopeDiagnosticCli([], async () => { controller.abort(); throw new Error("secret"); }, controller.signal);
  assert.deepEqual(cancelled, { stdout: "", stderr: "", exitCode: 130 });
  const failed = await runVtexSessionEnvelopeDiagnosticCli([], async () => { throw new Error("secret"); }, new AbortController().signal);
  assert.deepEqual(failed, { stdout: "", stderr: "VTEX session envelope diagnostic failed internally.\n", exitCode: 3 });
  const events: string[] = []; const writes: string[] = []; let interrupt = () => {};
  const runtime = { argv: ["node", "script"], exitCode: undefined as number | undefined,
    once: (_event: "SIGINT", handler: () => void) => { events.push("once"); interrupt = handler; },
    off: () => { events.push("off"); }, stdout: { write: (value: string) => writes.push(value) }, stderr: { write: (value: string) => writes.push(value) } };
  await executeVtexSessionEnvelopeDiagnosticCli(runtime, async () => { interrupt(); return { schemaVersion: 1, targets: [] } as never; });
  assert.deepEqual(events, ["once", "off"]); assert.deepEqual(writes, []); assert.equal(runtime.exitCode, 130);
});
