import { db } from "../../src/lib/db";
import { extractSimplePromotionFromPayload, type SimplePromotion } from "../../src/lib/promotions/capture";
import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { normalizeVtexCatalogPayload } from "../../src/lib/vtex/client";
import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import { readTopUpOffer } from "../../src/lib/vtex/topup";
import { persistStagedProducts } from "./stage";
import { reconcileStageProducts } from "./reconcile";
import { validateStageProducts } from "./validate";

// Gate 6 top-up: offers the daily searches missed are re-read by EAN through
// the same public REST read the promotion capture uses, staged in the same
// format with the same observation instant, and reconciled into the catalog.
// A read failure leaves the offer untouched and counts in the summary; it
// never aborts the top-up.

const TOP_UP_SOURCES = ["carrefour", "disco", "jumbo"];
const READ_DELAY_MS = 200;

export type TopUpSummary = {
  readsOk: number;
  readsFailed: number;
  offersFresh: number;
  perSource: Array<{ slug: string; readsOk: number; readsFailed: number }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowFor(product: NormalizedProduct | undefined, ean: string, name: string, observation: { price: number | null; listPrice: number | null; isAvailable: boolean; productUrl: string | null }): NormalizedProduct {
  if (!product) {
    // The product is absent from the source: record it as unavailable with
    // no price instead of carrying the stale one forward.
    return {
      ean, name, brand: null, description: null, imageUrl: null, images: [], category: null,
      skuId: null, sellerId: null, productUrl: null, price: null, listPrice: null,
      referencePrice: null, referenceUnit: null, isAvailable: false,
    };
  }
  return {
    ...product,
    ean,
    name: product.name || name,
    price: observation.price,
    listPrice: observation.listPrice,
    isAvailable: observation.isAvailable,
    productUrl: observation.productUrl ?? product.productUrl,
  };
}

async function topUpSource(slug: string, stamp: string, runStartedAt: Date, delayMs: number): Promise<{ readsOk: number; readsFailed: number; offersFresh: number }> {
  const offers = await db.$queryRaw<Array<{ product_ean: string; name: string }>>`
    select sp.product_ean, p.name
    from supermarket_products sp
    join products p on p.ean = sp.product_ean
    where sp.supermarket_id = (select id from supermarkets where slug = ${slug})
      and sp.price is not null
      and sp.last_checked_at < ${runStartedAt}`;
  if (offers.length === 0) {
    return { readsOk: 0, readsFailed: 0, offersFresh: 0 };
  }

  const supermarket = await db.supermarket.findFirst({ where: { slug, is_active: true, is_vtex: true }, select: { id: true } });
  if (!supermarket) throw new Error(`active staged source not found: ${slug}`);

  const run = await db.ingestionRun.create({
    data: {
      batch_id: `v1-refresh-${stamp}-topup-${slug}`,
      source_slug: slug,
      supermarket_id: supermarket.id,
      started_at: new Date(),
      status: "RUNNING",
    },
    select: { id: true },
  });

  const baseUrl = getSupermarketBySlug(slug).baseUrl;
  const rows: NormalizedProduct[] = [];
  const promoByEan = new Map<string, SimplePromotion | null>();
  let readsOk = 0;
  let readsFailed = 0;

  for (const offer of offers) {
    const read = await readTopUpOffer(baseUrl, offer.product_ean);
    if (!read.ok) {
      readsFailed += 1;
      await sleep(delayMs);
      continue;
    }

    readsOk += 1;
    const normalized = read.payload
      ? normalizeVtexCatalogPayload(read.payload, baseUrl).find((entry) => entry.ean === offer.product_ean)
      : undefined;
    rows.push(rowFor(normalized, offer.product_ean, offer.name, read.observation!));
    if (slug === "carrefour" && read.payload) {
      promoByEan.set(offer.product_ean, extractSimplePromotionFromPayload(read.payload, offer.product_ean));
    }
    await sleep(delayMs);
  }

  await persistStagedProducts(false, run.id, slug, rows, promoByEan);
  await validateStageProducts({ runId: run.id, slug });
  const reconciliation = await reconcileStageProducts({ batchId: `v1-refresh-${stamp}-topup-${slug}`, runId: run.id, batchSize: 500 });
  await db.ingestionRun.update({ where: { id: run.id }, data: { finished_at: new Date(), status: "SUCCESS", queries_sent: 0, products_fetched: readsOk, products_staged: rows.length, products_rejected: 0 } });

  return { readsOk, readsFailed, offersFresh: reconciliation.promoted };
}

export async function topUpUnobservedOffers({ stamp, runStartedAt, delayMs = READ_DELAY_MS }: { stamp: string; runStartedAt: Date; delayMs?: number }): Promise<TopUpSummary> {
  let readsOk = 0;
  let readsFailed = 0;
  let offersFresh = 0;
  const perSource: TopUpSummary["perSource"] = [];
  for (const slug of TOP_UP_SOURCES) {
    const summary = await topUpSource(slug, stamp, runStartedAt, delayMs);
    readsOk += summary.readsOk;
    readsFailed += summary.readsFailed;
    offersFresh += summary.offersFresh;
    perSource.push({ slug, readsOk: summary.readsOk, readsFailed: summary.readsFailed });
  }
  return { readsOk, readsFailed, offersFresh, perSource };
}
