import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";

import { DETAILED_CATEGORIES } from "../src/lib/vtex/categories";
import {
  handleCategories,
  handlePromotions,
  type PublicApiDeps,
} from "../src/lib/public-api";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

process.env.VERCEL = "1";

const FIXTURE = installSnapshotFixture();
const NOW = new Date(FIXTURE.generatedAt);

function request(path: string): NextRequest {
  return new NextRequest(`https://ofertas-super.vercel.app${path}`, {
    headers: { "x-forwarded-for": "203.0.113.7" },
  });
}

function deps(success = true): PublicApiDeps {
  return {
    limiter: {
      limit: async () => ({
        success,
        limit: 60,
        remaining: success ? 59 : 0,
        reset: NOW.getTime() + 60_000,
        pending: Promise.resolve(),
      }),
    },
    now: () => NOW,
  };
}

describe("categories and promotions are served from the snapshot", () => {
  it("categories returns the static taxonomy with snapshot counts and provenance", async () => {
    const response = await handleCategories(request("/api/categories"), deps());
    assert.equal(response.status, 200);
    const body = (await response.json()) as {
      items: { id: string; name: string; slug: string; icon: string | null; count: number; children: unknown[] }[];
      dataSource: string;
      degraded: boolean;
      verifiedAt: string;
    };
    assert.equal(body.dataSource, "database");
    assert.equal(body.degraded, false);
    assert.equal(typeof body.verifiedAt, "string");
    assert.deepEqual(body.items.map((item) => item.slug), DETAILED_CATEGORIES.map((category) => category.slug));
    const lacteos = body.items.find((item) => item.slug === "lacteos");
    const expectedDairy = FIXTURE.products.filter((product) => product.category === "Lácteos").length;
    assert.ok(lacteos, "the snapshot serves the dairy category");
    assert.equal(lacteos.count, expectedDairy);
    assert.equal(lacteos.icon, "lacteos");
    assert.deepEqual(lacteos.children, []);
  });

  it("categories respects the rate limiter", async () => {
    const response = await handleCategories(request("/api/categories"), deps(false));
    assert.equal(response.status, 429);
  });

  it("promotions returns an empty valid list when the snapshot carries no promotion rows", async () => {
    const response = await handlePromotions(request("/api/promotions"), deps());
    assert.equal(response.status, 200);
    const body = (await response.json()) as { items: unknown[]; dataSource: string; verifiedAt: string; latestCheckedAt: null };
    assert.deepEqual(body.items, []);
    assert.equal(body.dataSource, "database");
    assert.equal(typeof body.verifiedAt, "string");
    assert.equal(body.latestCheckedAt, null);
  });

  it("promotions still rejects invalid filters with 400", async () => {
    const response = await handlePromotions(request("/api/promotions?type=bogus"), deps());
    assert.equal(response.status, 400);
  });
});
