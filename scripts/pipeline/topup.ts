import { lookupCotoByEan } from "../../src/lib/coto/client";
import { db } from "../../src/lib/db";
import { extractSimplePromotionFromPayload, type SimplePromotion } from "../../src/lib/promotions/capture";
import { REFRESH_SOURCES } from "../../src/lib/refresh-sources";
import { getSupermarketBySlug } from "../../src/lib/supermarkets";
import { normalizeVtexCatalogPayload } from "../../src/lib/vtex/client";
import type { NormalizedProduct } from "../../src/lib/vtex/normalize";
import { readTopUpOffer, type TopUpObservation } from "../../src/lib/vtex/topup";
import { persistStagedProducts } from "./stage";
import { reconcileStageProducts } from "./reconcile";
import { readAllSources, readSourceOffers, type SourceReads, type TopUpOfferRef } from "./topup-reads";
import { validateStageProducts } from "./validate";

// Gate 6 top-up: offers the daily searches missed are re-read by EAN through
// the same public REST read the promotion capture uses (Coto: its own search), staged in the same
// format with the same observation instant, and reconciled into the catalog.
// A read failure leaves the offer untouched and counts in the summary; it
// never aborts the top-up. The sources are read concurrently and
// written one after another (see ./topup-reads.ts).

const TOP_UP_SOURCES = REFRESH_SOURCES;
const READ_DELAY_MS = 200;

export type TopUpSummary = {
  readsOk: number;
  readsFailed: number;
  offersFresh: number;
  perSource: Array<{ slug: string; readsOk: number; readsFailed: number }>;
};

function sleep(ms: number): Promise<void> {
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

async function unobservedOffers(slug: string, runStartedAt: Date): Promise<TopUpOfferRef[]> {
  return db.$queryRaw<TopUpOfferRef[]>`
    select sp.product_ean, p.name
    from supermarket_products sp
    join products p on p.ean = sp.product_ean
    where sp.supermarket_id = (select id from supermarkets where slug = ${slug})
      and sp.price is not null
      and sp.last_checked_at < ${runStartedAt}`;
}

// One shape for every source's read: the product as the source sells it
// (undefined when absent), its observation, and the promotion when the read
// carries one. VTEX stores read their public REST search by EAN; Coto reads
// its own search.
type OfferRead = { ok: boolean; observation: TopUpObservation | null; product?: NormalizedProduct; promo?: SimplePromotion | null };

async function readVtexOffer(slug: string, baseUrl: string, ean: string): Promise<OfferRead> {
  const read = await readTopUpOffer(baseUrl, ean);
  if (!read.ok || !read.payload) return read;
  return {
    ...read,
    product: normalizeVtexCatalogPayload(read.payload, baseUrl).find((entry) => entry.ean === ean),
    ...(slug === "carrefour" ? { promo: extractSimplePromotionFromPayload(read.payload, ean) } : {}),
  };
}

async function readCotoOffer(ean: string): Promise<OfferRead> {
  try {
    const found = await lookupCotoByEan(ean);
    if (!found) return { ok: true, observation: { found: false, price: null, listPrice: null, isAvailable: false, productUrl: null } };
    const { product, promo } = found;
    return { ok: true, product, promo, observation: { found: true, price: product.price, listPrice: product.listPrice, isAvailable: product.isAvailable, productUrl: product.productUrl } };
  } catch {
    return { ok: false, observation: null };
  }
}

function readSource(slug: string, offers: TopUpOfferRef[], delayMs: number): Promise<SourceReads<OfferRead>> {
  const baseUrl = getSupermarketBySlug(slug).baseUrl;
  const readOffer = slug === "coto" ? readCotoOffer : (ean: string) => readVtexOffer(slug, baseUrl, ean);
  return readSourceOffers({ slug, offers, delayMs, sleep, readOffer });
}

async function writeSource(source: SourceReads<OfferRead>, stamp: string): Promise<number> {
  const { slug } = source;
  const supermarket = await db.supermarket.findFirst({ where: { slug, is_active: true }, select: { id: true } });
  if (!supermarket) throw new Error(`active staged source not found: ${slug}`);

  const batchId = `v1-refresh-${stamp}-topup-${slug}`;
  const run = await db.ingestionRun.create({
    data: { batch_id: batchId, source_slug: slug, supermarket_id: supermarket.id, started_at: new Date(), status: "RUNNING" },
    select: { id: true },
  });

  const rows: NormalizedProduct[] = [];
  const promoByEan = new Map<string, SimplePromotion | null>();
  for (const { offer, read } of source.reads) {
    rows.push(rowFor(read.product, offer.product_ean, offer.name, read.observation!));
    if (read.promo !== undefined) promoByEan.set(offer.product_ean, read.promo);
  }

  await persistStagedProducts(false, run.id, slug, rows, promoByEan);
  await validateStageProducts({ runId: run.id, slug });
  const reconciliation = await reconcileStageProducts({ batchId, runId: run.id, batchSize: 500 });
  await db.ingestionRun.update({ where: { id: run.id }, data: { finished_at: new Date(), status: "SUCCESS", queries_sent: 0, products_fetched: source.readsOk, products_staged: rows.length, products_rejected: 0 } });
  return reconciliation.promoted;
}

export async function topUpUnobservedOffers({ stamp, runStartedAt, delayMs = READ_DELAY_MS }: { stamp: string; runStartedAt: Date; delayMs?: number }): Promise<TopUpSummary> {
  const sources = [];
  for (const slug of TOP_UP_SOURCES) sources.push({ slug, offers: await unobservedOffers(slug, runStartedAt) });

  const reads = await readAllSources<OfferRead>(sources, ({ slug, offers }) => readSource(slug, offers, delayMs));

  let offersFresh = 0;
  for (const source of reads) {
    process.stdout.write(`[refresh] top-up ${source.slug}: reads ok=${source.readsOk} failed=${source.readsFailed} in ${Math.round(source.elapsedMs / 1000)}s\n`);
    if (source.readsOk + source.readsFailed > 0) offersFresh += await writeSource(source, stamp);
  }
  return {
    readsOk: reads.reduce((total, source) => total + source.readsOk, 0),
    readsFailed: reads.reduce((total, source) => total + source.readsFailed, 0),
    offersFresh,
    perSource: reads.map(({ slug, readsOk, readsFailed }) => ({ slug, readsOk, readsFailed })),
  };
}
