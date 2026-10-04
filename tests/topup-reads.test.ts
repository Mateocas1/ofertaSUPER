import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readAllSources, readSourceOffers, type TopUpOfferRef } from "../scripts/pipeline/topup-reads";

const offers = (slug: string, count: number): TopUpOfferRef[] =>
  Array.from({ length: count }, (_, index) => ({ product_ean: `${slug}-${index}`, name: `${slug} ${index}` }));

describe("top-up reads", () => {
  it("reads one source sequentially, keeps the successful reads and counts the failures", async () => {
    const order: string[] = [];
    const sleeps: number[] = [];
    const result = await readSourceOffers({
      slug: "disco",
      offers: offers("disco", 3),
      delayMs: 200,
      sleep: async (ms) => { sleeps.push(ms); },
      readOffer: async (ean) => { order.push(ean); return { ok: ean !== "disco-1" }; },
    });

    assert.deepEqual(order, ["disco-0", "disco-1", "disco-2"]);
    assert.deepEqual(sleeps, [200, 200, 200]);
    assert.equal(result.readsOk, 2);
    assert.equal(result.readsFailed, 1);
    assert.deepEqual(result.reads.map(({ offer }) => offer.product_ean), ["disco-0", "disco-2"]);
  });

  it("reads every source at the same time and returns them in source order", async () => {
    const inFlight = new Set<string>();
    let maxConcurrentSources = 0;
    const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

    const results = await readAllSources(
      [{ slug: "carrefour", offers: offers("carrefour", 3) }, { slug: "disco", offers: offers("disco", 2) }, { slug: "jumbo", offers: offers("jumbo", 1) }],
      ({ slug, offers: sourceOffers }) => readSourceOffers({
        slug,
        offers: sourceOffers,
        delayMs: 0,
        sleep: tick,
        readOffer: async () => {
          inFlight.add(slug);
          maxConcurrentSources = Math.max(maxConcurrentSources, inFlight.size);
          await tick();
          inFlight.delete(slug);
          return { ok: true };
        },
      }),
    );

    assert.equal(maxConcurrentSources, 3);
    assert.deepEqual(results.map(({ slug, readsOk }) => [slug, readsOk]), [["carrefour", 3], ["disco", 2], ["jumbo", 1]]);
  });
});
