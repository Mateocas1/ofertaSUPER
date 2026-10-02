import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { HOME_PRICE_DROPS, getApprovedHomeCopy } from "../src/lib/home-ui-data";
import { buildPriceDropsView, loadPriceDrops, storeLabel } from "../src/lib/price-drops";
import {
  PRICE_DROPS_FEED_PATH,
  PRICE_DROPS_FEED_TITLE,
  PRICE_DROPS_PAGE_PATH,
} from "../src/lib/price-drops-feed";
import { buildAbsoluteUrl, canonicalProductPath, createMetadata } from "../src/lib/seo/metadata";

// The /bajas page renders the committed payload in three honest states. The
// copy and the routing contract are checked on the source (the repository has
// no React renderer in the test runner), and the data the page shows is checked
// against the view model it renders.

const PAGE_PATH = join(process.cwd(), "src", "app", "bajas", "page.tsx");
const ROUTE_PATH = join(process.cwd(), "src", "app", "bajas", "feed.xml", "route.ts");
const HOME_PATH = join(process.cwd(), "src", "app", "page.tsx");
const RED_FLAG_PATTERN = /\b(demo|mvp|prototype|prototipo|wip|pending|pendiente|v1|development|desarrollo)\b/i;
// Same pattern the public-copy suite uses: a negated mention is allowed.
const UNBACKED_LIVE_PRICE_PATTERN =
  /\b(Mercado vivo|precio actual|precio real|(?<!no )(?<!no son )(?<!no muestra )precios actuales|mejor total actual|en vivo|Actualizado hoy|Datos actualizados hoy|última semana|ultima semana)\b/i;

describe("price drops page contract", () => {
  it("renders the three states from the committed payload", () => {
    assert.equal(existsSync(PAGE_PATH), true);
    const source = readFileSync(PAGE_PATH, "utf8");

    assert.match(source, /export const metadata/);
    assert.match(source, /export default function/);
    assert.match(source, /loadPriceDrops/);
    assert.match(source, /buildPriceDropsView/);
    assert.match(source, /view\.unavailable/);
    assert.match(source, /view\.isEmpty/);
    assert.match(source, /function DropRow/);
    assert.match(source, /Suscribirse al feed Atom/);
  });

  it("keeps the page copy honest and free from red flags", () => {
    assert.equal(existsSync(PAGE_PATH), true);
    const source = readFileSync(PAGE_PATH, "utf8");

    assert.doesNotMatch(source, RED_FLAG_PATTERN);
    assert.doesNotMatch(source, UNBACKED_LIVE_PRICE_PATTERN);
    assert.match(source, /observaciones registradas/);
  });

  it("declares the Atom feed as the alternate representation of the page", () => {
    const source = readFileSync(PAGE_PATH, "utf8");
    assert.match(source, /feeds: \[\{ path: PRICE_DROPS_FEED_PATH, title: PRICE_DROPS_FEED_TITLE \}\]/);

    const metadata = createMetadata({
      title: "Bajas de precio",
      description: "Bajas de precio del catálogo.",
      path: PRICE_DROPS_PAGE_PATH,
      feeds: [{ path: PRICE_DROPS_FEED_PATH, title: PRICE_DROPS_FEED_TITLE }],
    });
    const alternates = metadata.alternates as {
      canonical: string;
      types: Record<string, Array<{ url: string; title: string }>>;
    };
    assert.equal(alternates.canonical, buildAbsoluteUrl(PRICE_DROPS_PAGE_PATH));
    assert.deepEqual(alternates.types["application/atom+xml"], [
      { url: buildAbsoluteUrl(PRICE_DROPS_FEED_PATH), title: PRICE_DROPS_FEED_TITLE },
    ]);
  });

  it("serves the feed route from the committed payload with a request-time render", () => {
    assert.equal(existsSync(ROUTE_PATH), true);
    const source = readFileSync(ROUTE_PATH, "utf8");

    assert.match(source, /export function GET\(\): Response/);
    assert.match(source, /priceDropsFeedResponse\(loadPriceDrops\)/);
    assert.match(source, /export const dynamic = "force-dynamic"/);
  });

  it("links the home page to the page and the feed, without touching the approved navigation", () => {
    assert.equal(existsSync(HOME_PATH), true);
    const source = readFileSync(HOME_PATH, "utf8");

    assert.match(source, /href="\/bajas"/);
    assert.match(source, /href=\{PRICE_DROPS_FEED_PATH\}/);
    assert.match(source, /type="application\/atom\+xml"/);
    assert.match(source, /buildAbsoluteUrl\(PRICE_DROPS_FEED_PATH\)/);
  });
});

describe("price drops page data", () => {
  it("renders exactly what the committed payload publishes", () => {
    const payload = loadPriceDrops();
    const view = buildPriceDropsView(payload);

    assert.equal(view.unavailable, false);
    assert.equal(view.isEmpty, payload.drops.length === 0);
    assert.equal(view.drops.length, payload.drops.length);
    for (const drop of view.drops) {
      assert.ok(drop.name.length > 0);
      assert.equal(storeLabel(drop.source).length > 0, true);
      assert.match(canonicalProductPath(drop.ean), /^\/producto\/\d{8,18}$/);
      assert.ok(drop.currentPrice < drop.previousPrice);
    }
  });

  it("falls back to an unavailable view when the payload cannot be read", () => {
    const view = buildPriceDropsView(null);

    assert.equal(view.unavailable, true);
    assert.equal(view.isEmpty, true);
    assert.deepEqual(view.drops, []);
  });

  it("keeps the home promotion of the page inside the approved home copy", () => {
    const copy = getApprovedHomeCopy();

    assert.ok(copy.includes(HOME_PRICE_DROPS.title));
    assert.ok(copy.includes(HOME_PRICE_DROPS.action));
    assert.doesNotMatch(copy.join(" "), RED_FLAG_PATTERN);
    assert.doesNotMatch(copy.join(" "), UNBACKED_LIVE_PRICE_PATTERN);
  });
});
