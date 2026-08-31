import assert from "node:assert/strict";
import { test } from "node:test";
import { createRegionalProbeHttp } from "@/lib/vtex/regional-read-probe";
const bytes = (value: string) => new TextEncoder().encode(value);
const ok = (headers: Readonly<Record<string, unknown>> = {}) => ({
  status: 200, data: bytes('{"safe":true}'), headers,
});
const cookies = (session: string, segment: string) => ({
  "set-cookie": [
    "vtex_session=discarded; Path=/",
    `vtex_session=${session}; HttpOnly`,
    `vtex_segment=${segment}; Secure`,
  ],
});
const open = async (
  request: Parameters<typeof createRegionalProbeHttp>[0],
  postalCode: "1425" | "5000" = "1425",
  signal = new AbortController().signal,
) => createRegionalProbeHttp(request).openSession({ postalCode, timeoutMs: 10000, signal });
const catalog = async (response: unknown) => {
  let calls = 0;
  const session = await open(async () => ++calls === 1 ? ok(cookies("session", "segment")) : response as never);
  assert.equal(session.kind, "payload");
  if (session.kind !== "payload" || !session.readCatalog) throw new Error("catalog closure missing");
  return session.readCatalog({ ean: "00123456", timeoutMs: 10000, signal: new AbortController().signal });
};
test("factory emits exact session and catalog configs with one request per operation", async () => {
  const configs: Array<Record<string, unknown>> = [];
  const signal = new AbortController().signal;
  const http = createRegionalProbeHttp(async (config) => {
    configs.push(config);
    return configs.length === 1 ? ok(cookies("session=part", "segment")) : ok();
  });
  const session = await http.openSession({ postalCode: "1425", timeoutMs: 10000, signal });
  assert.equal(session.kind, "payload");
  if (session.kind !== "payload") return;
  assert.equal(session.requiredCookiesPresent, true);
  assert.ok(session.readCatalog);
  const catalog = await session.readCatalog({ ean: "0012345678901", timeoutMs: 10000, signal });
  assert.deepEqual(catalog, { kind: "payload", payload: { safe: true } });
  assert.equal(configs.length, 2);
  const common = {
    timeout: 10000,
    signal,
    maxRedirects: 0,
    responseType: "arraybuffer",
    transformResponse: [],
  };
  assert.deepEqual(configs[0], {
    method: "POST",
    url: "https://www.jumbo.com.ar/api/sessions",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin: "https://www.jumbo.com.ar",
      referer: "https://www.jumbo.com.ar/",
      "user-agent": "Mozilla/5.0 (compatible; ofertaSUPER regional read probe/1.0)",
    },
    data: '{"public":{"country":{"value":"ARG"},"postalCode":{"value":"1425"}}}',
    ...common,
    validateStatus: configs[0].validateStatus,
  });
  assert.equal((configs[0].validateStatus as (status: number) => boolean)(599), true);
  assert.deepEqual(configs[1], {
    method: "GET",
    url: "https://www.jumbo.com.ar/api/catalog_system/pub/products/search?fq=alternateIds_Ean:0012345678901",
    headers: {
      accept: "application/json",
      origin: "https://www.jumbo.com.ar",
      referer: "https://www.jumbo.com.ar/",
      "user-agent": "Mozilla/5.0 (compatible; ofertaSUPER regional read probe/1.0)",
      cookie: "vtex_session=session=part; vtex_segment=segment",
    },
    ...common,
    validateStatus: configs[1].validateStatus,
  });
});
test("cookie parsing fails closed for ineligible separate-header forms", async () => {
  const cases: unknown[] = [
    undefined,
    [],
    "vtex_session=a, vtex_segment=b",
    ["vtex_session=a", 7, "vtex_segment=b"],
    ["Vtex_session=a", "vtex_segment=b"],
    ["vtex_session=a", "vtex_segment=b", "vtex_session="],
    ["vtex_session=a", "vtex_segment=b", "vtex_segment=bad,value"],
  ];
  for (const header of cases) {
    const result = await open(async () => ok({ "set-cookie": header }));
    assert.equal(result.kind, "payload");
    if (result.kind === "payload") {
      assert.equal(result.requiredCookiesPresent, false);
      assert.equal(result.readCatalog, null);
    }
  }
});
test("session and catalog share the closed status and body matrix", async () => {
  const at = (stage: "session" | "catalog", response: unknown) => stage === "session"
    ? open(async () => response as never) : catalog(response);
  const boundary = (start: number) => {
    const value = new Uint8Array(start + 7).fill(120); value.set(bytes("captcha"), start); return value;
  };
  const hostileData = new Proxy({}, { getPrototypeOf() { throw new Error("hostile data"); } });
  for (const stage of ["session", "catalog"] as const) {
    let bodyReads = 0;
    const noBody = new Proxy({ status: 429, headers: {} }, { getOwnPropertyDescriptor(target, property) {
      if (property === "data") { bodyReads += 1; throw new Error("body access"); }
      return Reflect.getOwnPropertyDescriptor(target, property);
    } });
    assert.deepEqual(await at(stage, noBody), { kind: "rate_limited" }); assert.equal(bodyReads, 0);
    for (const status of [403, 503]) for (const marker of ["CaPtChA", "AcCeSs DeNiEd", "ToO MaNy ReQuEsTs"])
      assert.deepEqual(await at(stage, { status, data: bytes(marker), headers: {} }), { kind: "rate_limited" });
    for (const status of [403, 503, 500])
      assert.deepEqual(await at(stage, { status, data: bytes("plain outage"), headers: {} }), { kind: "transport_error" });
    for (const [data, kind] of [[boundary(65_529), "rate_limited"], [boundary(65_530), "transport_error"],
      [boundary(65_536), "transport_error"]] as const)
      assert.deepEqual(await at(stage, { status: 503, data, headers: {} }), { kind });
    for (const data of [bytes("{"), Uint8Array.of(255), null, {}, hostileData])
      assert.deepEqual(await at(stage, { status: 200, data, headers: {} }), { kind: "parse_error" });
    assert.deepEqual(await at(stage, { status: Number.NaN, data: bytes("{}"), headers: {} }), { kind: "transport_error" });
  }
});
test("invalid runtime response and header shapes fail closed", async () => {
  const hostile = new Proxy({}, { get() { throw new Error("hostile shape"); } });
  assert.deepEqual(await open(async () => null as never), { kind: "transport_error" });
  assert.deepEqual(await catalog(null), { kind: "transport_error" });
  assert.deepEqual(await open(async () => hostile as never), { kind: "transport_error" });
  for (const headers of [null, hostile, { "set-cookie": new Proxy([], { get() { throw new Error("hostile lines"); } }) }])
    assert.deepEqual(await open(async () => ({ status: 200, data: bytes("{}"), headers }) as never), {
      kind: "payload", payload: {}, requiredCookiesPresent: false, readCatalog: null,
    });
});
test("catalog closures retain only their own final cookie pair", async () => {
  const catalogCookies: string[] = [];
  let sessions = 0;
  const http = createRegionalProbeHttp(async (config) => {
    if (config.method === "POST") {
      sessions += 1;
      assert.equal(config.data, `{"public":{"country":{"value":"ARG"},"postalCode":{"value":"${sessions === 1 ? "1425" : "5000"}"}}}`);
      return ok(cookies(`session${sessions}=tail`, `segment${sessions}`));
    }
    catalogCookies.push(config.headers.cookie);
    return ok();
  });
  const signal = new AbortController().signal;
  const first = await http.openSession({ postalCode: "1425", timeoutMs: 10000, signal });
  const second = await http.openSession({ postalCode: "5000", timeoutMs: 10000, signal });
  assert.equal(first.kind, "payload"); assert.equal(second.kind, "payload");
  if (first.kind !== "payload" || second.kind !== "payload") return;
  await first.readCatalog?.({ ean: "00123456", timeoutMs: 10000, signal });
  await second.readCatalog?.({ ean: "00123456", timeoutMs: 10000, signal });
  assert.deepEqual(catalogCookies, [
    "vtex_session=session1=tail; vtex_segment=segment1",
    "vtex_session=session2=tail; vtex_segment=segment2",
  ]);
});
test("session and catalog rejections never access secret-bearing runtime fields", async () => {
  const fields = ["message", "stack", "config", "request", "response", "headers", "data", "URL", "toJSON"];
  const rejection = (stage: string, code: string, index: number) => {
    const accessed: string[] = [];
    const seed = [stage, code, index, "s".repeat(index + 1)].join("-");
    const target = Object.fromEntries(fields.map((field) => [field, `${seed}-${field}`]));
    Object.defineProperty(target, "code", { value: code });
    return { value: new Proxy(target, { get(object, property, receiver) {
      if (property !== "code") accessed.push(String(property));
      return Reflect.get(object, property, receiver);
    } }), accessed };
  };
  const cases = [["ERR_CANCELED", "aborted"], ["ECONNABORTED", "timeout"],
    ["ETIMEDOUT", "timeout"], ["NETWORK", "transport_error"]] as const;
  for (const [index, [code, kind]] of cases.entries()) for (const stage of ["session", "catalog"] as const) {
    const secret = rejection(stage, code, index);
    const result = stage === "session" ? await open(async () => { throw secret.value; })
      : await catalog(Promise.reject(secret.value));
    assert.deepEqual(result, { kind });
    assert.deepEqual(secret.accessed, []);
  }
  const controller = new AbortController(); controller.abort(); let called = false;
  assert.deepEqual(await open(async () => { called = true; return ok(); }, "1425", controller.signal), { kind: "aborted" });
  assert.equal(called, false);
});
test("safe values exclude cookie, header, non-2xx body, and rejection URL sentinels", async () => {
  const secrets = ["cookie", "segment", "header", "body", "url"].map((part, index) => `${part}-${index}-${"x".repeat(index + 1)}`);
  const session = await open(async () => ok({ ...cookies(secrets[0], secrets[1]), "x-secret": secrets[2] }));
  assert.equal(session.kind, "payload");
  if (session.kind !== "payload") return;
  for (const value of [session.kind, (session.payload as { safe: boolean }).safe,
    session.requiredCookiesPresent, session.readCatalog === null]) assert.equal(secrets.includes(String(value)), false);
  const result = await catalog({ status: 503, data: bytes(secrets[3]), headers: { location: secrets[4] } });
  assert.deepEqual(result, { kind: "transport_error" });
  assert.equal(secrets.includes(result.kind), false);
});
