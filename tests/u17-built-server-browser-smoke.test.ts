import test from "node:test";
import assert from "node:assert/strict";

import { assertDeniedGovernedHtml, assertDeniedGovernedRsc, assertEligibleGovernedOutput, createBasketStorageValue } from "../scripts/u17-built-server-browser-smoke";

function flightRecord(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    c: ["", "producto", "7790000000001"],
    f: [[[["ean", "7790000000001", "d", []], {}]]],
    ...extra,
  });
}

test("U17 denied HTML permits a real Next router c path only alongside its ean dynamic segment", () => {
  const routeState = flightRecord();
  const accepted = `<main>El catálogo no está disponible</main><script>self.__next_f.push([1,${JSON.stringify(`0:${routeState}`)}])</script>`;

  assert.doesNotThrow(() => assertDeniedGovernedHtml("HTML", accepted));
  assert.throws(() => assertDeniedGovernedHtml("visible text", `<main>7790000000001</main><script>self.__next_f.push([1,${JSON.stringify(`0:${routeState}`)}])</script>`), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedHtml("canonical", `<link rel="canonical" href="/producto/7790000000001"><script>self.__next_f.push([1,${JSON.stringify(`0:${routeState}`)}])</script>`), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedHtml("JSON-LD", '<script type="application/ld+json">{"@type":"Product","sku":"7790000000001"}</script>'), /leaked governed fact|leaked Product/);
  assert.throws(() => assertDeniedGovernedHtml("product script object", `<script>window.product={ean:"7790000000001"}</script>`), /leaked governed fact/);
});

test("U17 denied RSC rejects application c paths and tuples outside the structural router state", () => {
  const routeState = flightRecord();

  assert.doesNotThrow(() => assertDeniedGovernedRsc("RSC", `0:${routeState}`));
  assert.throws(() => assertDeniedGovernedRsc("truncated route tuple", '0:["ean","7790000000001","d"]'), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("application tuple", `0:${flightRecord({ payload: ["ean", "7790000000001", "d", []] })}`), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("application canonical segments", `0:${flightRecord({ payload: { c: ["", "producto", "7790000000001"] } })}`), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("unbound router canonical segments", '0:{"c":["","producto","7790000000001"]}'), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("product DTO", '0:{"ean":"7790000000001","name":"Snapshot product"}'), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("canonical", '0:{"initialCanonicalUrl":"/producto/7790000000001"}'), /leaked governed fact/);
  assert.throws(() => assertDeniedGovernedRsc("product link", '0:["$","a",null,{"href":"/producto/7790000000001"}]'), /leaked governed fact/);
  assert.doesNotThrow(() => assertDeniedGovernedRsc("sitemap", "<urlset><loc>/categoria/almacen</loc></urlset>"));
});

test("U17 eligible built-output contract requires the serving product and optional promotion", () => {
  assert.doesNotThrow(() => assertEligibleGovernedOutput("product", "7790000000001 Snapshot product"));
  assert.doesNotThrow(() => assertEligibleGovernedOutput("offers", "7790000000001 Snapshot product Snapshot promotion", { promotion: true }));
  assert.throws(() => assertEligibleGovernedOutput("offers", "7790000000001 Snapshot product", { promotion: true }), /omitted the serving promotion/);
});

test("U17 basket browser setup persists the versioned basket envelope", () => {
  assert.deepEqual(JSON.parse(createBasketStorageValue()), {
    version: 1,
    value: [{ ean: "7790000000001", qty: 1 }],
  });
});
