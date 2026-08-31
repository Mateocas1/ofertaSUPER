import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRegionalProbeHttp, probeJumboRegionalEan,
  type ProbeSessionResult, type RegionalProbeHttp,
} from "@/lib/vtex/regional-read-probe";
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
const sessionPayload = (postalCode: string, regionId: unknown) => ({ namespaces: {
  public: { postalCode: { value: postalCode } }, checkout: { regionId: { value: regionId } },
} });
const highHttp = (make: (postalCode: "1425" | "5000") => ProbeSessionResult | Promise<ProbeSessionResult>): RegionalProbeHttp => ({
  openSession: ({ postalCode }) => Promise.resolve(make(postalCode)),
});
const usable = (postalCode: "1425" | "5000", region: string, payload: unknown): ProbeSessionResult => ({
  kind: "payload", payload: sessionPayload(postalCode, region), requiredCookiesPresent: true,
  readCatalog: async () => ({ kind: "payload", payload }),
});
test("core validates once and evaluates fixed targets sequentially with literal timeout", async () => {
  const calls: string[] = []; let clocks = 0;
  const http: RegionalProbeHttp = { async openSession(input) {
    calls.push(`s${input.postalCode}:${input.timeoutMs}`);
    return { kind: "payload", payload: sessionPayload(input.postalCode, `r${input.postalCode}`), requiredCookiesPresent: true,
      readCatalog: async (catalogInput) => { calls.push(`c${input.postalCode}:${catalogInput.ean}:${catalogInput.timeoutMs}`); return { kind: "payload", payload: [] }; } };
  } };
  const report = await probeJumboRegionalEan({ ean: "00123456", http, now: () => { clocks += 1; return new Date("2026-01-02T03:04:05Z"); } });
  assert.equal(clocks, 1); assert.deepEqual(calls, ["s1425:10000", "c1425:00123456:10000", "s5000:10000", "c5000:00123456:10000"]);
  assert.deepEqual([report.schemaVersion, report.observedAt, report.retailer, report.ean, report.outcome], [1, "2026-01-02T03:04:05.000Z", "jumbo", "00123456", "confirmed_absent"]);
  assert.deepEqual(report.targets.map((target) => target.postalCode), ["CP1425", "CP5000"]);
  for (const ean of ["1234567", "123456789012345", "１２３４５６７８", "1234567x"]) await assert.rejects(probeJumboRegionalEan({ ean, http }));
});
test("recognized session proofs fail independently and suppress only their catalog", async () => {
  const cases = [
    [sessionPayload("wrong", "r1"), true, "context_unresolved", "postal_code_unconfirmed"],
    [sessionPayload("1425", "r1"), false, "context_unresolved", "required_cookies_unconfirmed"],
    [sessionPayload("1425", null), true, "context_unresolved", "region_id_unconfirmed"],
    [{ unknown: true }, true, "parse_error", "session_payload_uninspectable"],
  ] as const;
  for (const [payload, requiredCookiesPresent, outcome, code] of cases) {
    let catalogs = 0;
    const readCatalog = async () => { catalogs += 1; return { kind: "payload" as const, payload: [] }; };
    const report = await probeJumboRegionalEan({ ean: "12345678", http: highHttp((postalCode) => postalCode === "1425"
      ? { kind: "payload", payload, requiredCookiesPresent, readCatalog }
      : { ...usable("5000", "r2", []), readCatalog }) });
    assert.equal(catalogs, 1); assert.equal(report.targets[0].outcome, outcome);
    assert.deepEqual(report.targets[0].failureCodes, [code]); assert.equal(report.targets[1].outcome, "confirmed_absent");
  }
});
test("closed session failures map by stage and both targets continue", async () => {
  const cases = [["rate_limited", "rate_limited", "session_rate_limited"], ["timeout", "transport_error", "session_timeout"],
    ["transport_error", "transport_error", "session_transport_failed"], ["parse_error", "parse_error", "session_payload_uninspectable"]] as const;
  for (const [kind, outcome, code] of cases) {
    let calls = 0; const report = await probeJumboRegionalEan({ ean: "12345678", http: highHttp(() => { calls += 1; return { kind }; }) });
    assert.equal(calls, 2); assert.equal(report.outcome, outcome); assert.deepEqual(report.targets[0].failureCodes, [code]);
  }
  await assert.rejects(probeJumboRegionalEan({ ean: "12345678", http: highHttp(() => ({ kind: "aborted" })) }));
  const controller = new AbortController(); controller.abort(); await assert.rejects(probeJumboRegionalEan({ ean: "12345678", http: highHttp(() => usable("1425", "r", [])), signal: controller.signal }));
});
const sku = (ean: unknown, price: unknown = 10, listPrice: unknown = 20, extra: Record<string, unknown> = {}) => ({
  itemId: `sku-${String(ean)}`, ean, sellers: [{ sellerDefault: true, commertialOffer: { Price: price, ListPrice: listPrice } }], ...extra,
});
const product = (ean: unknown, items: unknown, productId = "product") => ({ productId, ean, items });
const probePayloads = (first: unknown, second: unknown = []) => probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) =>
  usable(postalCode, postalCode === "1425" ? "north" : "south", postalCode === "1425" ? first : second)),
  now: () => new Date("2026-02-03T04:05:06Z"),
});
test("catalog traverses every exact candidate and retains found over malformed siblings", async () => {
  const report = await probePayloads([
    product("other", [sku("other"), sku("00123456", 10, 50)], "p1"),
    { productId: "p2", referenceId: [{ value: "00123456" }], items: [sku("different")] },
    { productId: "p3", EAN: "different", items: [{ itemId: "s3", referenceId: [{ Value: "00123456" }], sellers: [{ sellerDefault: true, commercialOffer: { Price: 7, ListPrice: 7 } }] }] },
    null,
  ]);
  assert.equal(report.outcome, "found");
  assert.deepEqual(report.targets[0].exactMatches, [
    { productId: "p1", skuId: "sku-00123456", ean: "00123456", price: 10, listPrice: 50, warningCodes: [] },
    { productId: "p2", skuId: null, ean: "00123456", price: null, listPrice: null, warningCodes: ["exact_ean_without_sku_match"] },
    { productId: "p3", skuId: "s3", ean: "00123456", price: 7, listPrice: 7, warningCodes: [] },
  ]);
  assert.deepEqual(report.targets[0].failureCodes, ["catalog_payload_uninspectable"]);
  assert.deepEqual(report.warningCodes, ["exact_ean_without_sku_match"]);
});
test("price evidence uses one default seller and closed warning rules", async () => {
  const cases = [
    [sku("00123456", 3050, 252066), 3050, null, "list_price_unusable"],
    [sku("00123456", 5, 25), 5, 25, null],
    [sku("00123456", 5, 4), 5, null, "list_price_unusable"],
    [sku("00123456", 0, 2), null, null, "selling_price_unusable"],
    [sku("00123456", 5, 10, { sellers: [] }), null, null, "primary_default_seller_unavailable"],
    [sku("00123456", 5, 10, { sellers: [{ sellerDefault: true, commertialOffer: { Price: 5, ListPrice: 10 } }, { sellerDefault: true, commertialOffer: { Price: 6, ListPrice: 12 } }] }), null, null, "primary_default_seller_unavailable"],
  ] as const;
  for (const [item, price, listPrice, warning] of cases) {
    const report = await probePayloads([product("other", [item])]); const match = report.targets[0].exactMatches[0];
    assert.equal(report.outcome, "found"); assert.deepEqual([match.price, match.listPrice], [price, listPrice]);
    assert.deepEqual(match.warningCodes, warning ? [warning] : []);
  }
});
test("trustworthy absence and malformed envelopes fail closed", async () => {
  const inspectable = [product("other-product", [sku("other-sku")])];
  assert.equal((await probePayloads(inspectable, inspectable)).outcome, "confirmed_absent");
  for (const payload of [{ products: [] }, [null], [product("other", null)], [product("other", [{ itemId: "x", ean: 7 }])],
    [{ productId: "p", referenceId: {}, items: [sku("other")] }], [product("other", [{ itemId: "s", referenceId: {} }])],
    [{ productId: "p", referenceId: [null], items: [sku("other")] }], [product("other", [{ itemId: "s", referenceId: [null] }])],
    [{ productId: "p", referenceId: [{ Value: 7 }], items: [sku("other")] }], [product("other", [{ itemId: "s", referenceId: [{ value: 7 }] }])]]) {
    const report = await probePayloads(payload); assert.equal(report.targets[0].outcome, "parse_error");
    assert.deepEqual(report.targets[0].failureCodes, ["catalog_payload_uninspectable"]);
  }
  const hostile = new Proxy({}, { getPrototypeOf() { throw new Error("opaque"); } });
  assert.equal((await probePayloads([hostile])).targets[0].outcome, "parse_error");
});
test("aggregation is found-first, distinct-region strict, and precedence ordered", async () => {
  const found = [product("other", [sku("00123456")])];
  for (const kind of ["rate_limited", "timeout", "parse_error", "context"] as const) {
    const report = await probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) => postalCode === "1425" ? usable("1425", "same", found)
      : kind === "context" ? { kind: "payload", payload: sessionPayload("5000", "other"), requiredCookiesPresent: false, readCatalog: null } : { kind }) });
    assert.equal(report.outcome, "found");
  }
  const sameFound = await probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) => usable(postalCode, "same", postalCode === "1425" ? found : [])) });
  assert.equal(sameFound.outcome, "found"); assert.deepEqual(sameFound.targets.map((target) => target.outcome), ["found", "confirmed_absent"]);
  const same = await probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) => usable(postalCode, "same", [])) });
  assert.equal(same.outcome, "context_unresolved"); assert.deepEqual(same.failureCodes, ["regions_not_distinct"]);
  assert.deepEqual(same.targets.map((target) => target.failureCodes), [[], []]);
  const precedence = [["rate_limited", "timeout", "rate_limited"], ["rate_limited", "parse_error", "rate_limited"],
    ["rate_limited", "context", "rate_limited"], ["timeout", "parse_error", "transport_error"],
    ["timeout", "context", "transport_error"], ["parse_error", "context", "parse_error"]] as const;
  for (const [left, right, expected] of precedence) for (const reverse of [false, true]) {
    const report = await probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) => {
      const kind = (postalCode === "1425") !== reverse ? left : right;
      return kind === "context" ? { kind: "payload", payload: sessionPayload(postalCode, `r${postalCode}`), requiredCookiesPresent: false, readCatalog: null } : { kind };
    }) }); assert.equal(report.outcome, expected);
  }
});
test("report schema and factory-backed serialization exclude generated sentinels", async () => {
  const secrets = ["cookie", "segment", "header", "payload", "error", "transport"].map((part, index) => `${part}-stack2-${index}-${"q".repeat(index + 1)}`);
  let calls = 0;
  const http = createRegionalProbeHttp(async (config) => {
    calls += 1;
    if (calls === 1) return { status: 200, data: bytes(JSON.stringify({ ...sessionPayload("1425", "region-a"), unrelated: secrets[3] })),
      headers: { ...cookies(secrets[0], secrets[1]), "x-generated": secrets[2] } };
    if (calls === 2) return { status: 200, data: bytes(JSON.stringify([product("other", [sku("00123456"), { itemId: secrets[5], ean: "other" }])])), headers: {} };
    const error = Object.defineProperty({ message: secrets[4], url: secrets[5] }, "code", { value: "NETWORK" }); throw error;
  });
  const report = await probeJumboRegionalEan({ ean: "00123456", http, now: () => new Date("2026-03-04T05:06:07Z") });
  assert.equal(report.outcome, "found"); assert.equal(calls, 3);
  assert.deepEqual(Object.keys(report), ["schemaVersion", "observedAt", "retailer", "ean", "outcome", "warningCodes", "failureCodes", "targets"]);
  assert.deepEqual(Object.keys(report.targets[0]), ["postalCode", "outcome", "acceptedPostalCode", "requiredCookiesPresent", "regionId", "exactMatches", "warningCodes", "failureCodes"]);
  assert.deepEqual(Object.keys(report.targets[0].exactMatches[0]), ["productId", "skuId", "ean", "price", "listPrice", "warningCodes"]);
  const serialized = JSON.stringify(report); for (const secret of secrets) { assert.equal(serialized.includes(secret), false); assert.equal(JSON.stringify(report).includes(secret), false); }
  assert.equal(/stock|availability|sellerId|url/i.test(serialized), false);
});
test("catalog failures retain context proof and use stage-specific closed codes", async () => {
  const cases = [
    ["rate_limited", "rate_limited", "catalog_rate_limited"],
    ["timeout", "transport_error", "catalog_timeout"],
    ["transport_error", "transport_error", "catalog_transport_failed"],
    ["parse_error", "parse_error", "catalog_payload_uninspectable"],
  ] as const;
  for (const [kind, outcome, code] of cases) {
    const report = await probeJumboRegionalEan({ ean: "00123456", http: highHttp((postalCode) => ({
      kind: "payload", payload: sessionPayload(postalCode, `region-${postalCode}`), requiredCookiesPresent: true,
      readCatalog: async () => ({ kind }),
    })) });
    assert.equal(report.outcome, outcome);
    assert.deepEqual(report.targets[0], {
      postalCode: "CP1425", outcome, acceptedPostalCode: true, requiredCookiesPresent: true,
      regionId: "region-1425", exactMatches: [], warningCodes: [], failureCodes: [code],
    });
  }
});
test("warning and failure unions are closed, ordered, and duplicate-free", async () => {
  const payload = [product("other", [
    sku("00123456", 0, 1),
    sku("00123456", 1, 99),
    sku("00123456", 1, 2, { sellers: [] }),
  ]), { productId: "only-product", ean: "00123456", items: [sku("other")] }, null];
  const report = await probePayloads(payload, payload);
  assert.deepEqual(report.warningCodes, [
    "exact_ean_without_sku_match", "primary_default_seller_unavailable",
    "selling_price_unusable", "list_price_unusable",
  ]);
  assert.deepEqual(report.failureCodes, ["catalog_payload_uninspectable"]);
  assert.equal(new Set(report.warningCodes).size, report.warningCodes.length);
  assert.equal(new Set(report.failureCodes).size, report.failureCodes.length);
});
test("session allowlist rejects alternate paths and clock validation makes no request", async () => {
  let calls = 0;
  const alternate = { public: { postalCode: { value: "1425" } }, namespaces: {
    public: {}, checkout: { postalCode: { value: "1425" }, regionId: { value: "region" } },
  } };
  const report = await probeJumboRegionalEan({ ean: "12345678", http: highHttp(() => {
    calls += 1; return { kind: "payload", payload: alternate, requiredCookiesPresent: true, readCatalog: null };
  }) });
  assert.equal(calls, 2); assert.equal(report.targets[0].outcome, "context_unresolved");
  assert.deepEqual(report.targets[0].failureCodes, ["postal_code_unconfirmed"]);
  calls = 0;
  await assert.rejects(probeJumboRegionalEan({ ean: "12345678", now: () => new Date(Number.NaN), http: highHttp(() => { calls += 1; return { kind: "transport_error" }; }) }));
  assert.equal(calls, 0);
});
