import { buildAbsoluteUrl, canonicalProductPath } from "@/lib/seo/metadata";
import { formatDropAmount, formatDropPercent, storeLabel, type PriceDrop, type PriceDropsPayload } from "@/lib/price-drops";

// Atom feed over the committed price-drops payload. One entry per drop, with an
// id that only depends on the offer and the day it was published, so a
// subscriber's reader never sees the same drop twice nor loses it when the next
// refresh rewrites the file.

export const PRICE_DROPS_FEED_PATH = "/bajas/feed.xml";
export const PRICE_DROPS_PAGE_PATH = "/bajas";
export const PRICE_DROPS_FEED_TITLE = "ofertasSUPER — bajas de precio";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/** Stable per offer and day: the same drop keeps the same id across refreshes. */
export function priceDropEntryId(drop: PriceDrop): string {
  return `urn:ofertasuper:baja:${drop.ean}:${drop.source}:${drop.date}`;
}

export function priceDropEntryTitle(drop: PriceDrop): string {
  return `${drop.name} bajó ${formatDropPercent(drop.percentDrop)} en ${storeLabel(drop.source)}`;
}

export function priceDropEntrySummary(drop: PriceDrop): string {
  return `Precio registrado antes: ${formatDropAmount(drop.previousPrice)} (${drop.previousObservedAt}). Ahora: ${formatDropAmount(drop.currentPrice)} (${drop.observedAt}). Caída de ${formatDropAmount(drop.amountDrop)}.`;
}

function entry(drop: PriceDrop): string {
  const link = buildAbsoluteUrl(canonicalProductPath(drop.ean));
  return [
    "  <entry>",
    `    <title>${escapeXml(priceDropEntryTitle(drop))}</title>`,
    `    <id>${escapeXml(priceDropEntryId(drop))}</id>`,
    `    <link rel="alternate" type="text/html" href="${escapeXml(link)}"/>`,
    `    <updated>${escapeXml(drop.observedAt)}</updated>`,
    `    <published>${escapeXml(drop.observedAt)}</published>`,
    `    <category term="${escapeXml(drop.source)}"/>`,
    `    <summary type="text">${escapeXml(priceDropEntrySummary(drop))}</summary>`,
    "  </entry>",
  ].join("\n");
}

export const PRICE_DROPS_FEED_HEADERS = {
  "content-type": "application/atom+xml; charset=utf-8",
  "cache-control": "public, max-age=0, must-revalidate",
} as const;

// A payload that cannot be read never yields a partial or invented feed: the
// subscriber gets an explicit 503 instead of an empty list.
export function priceDropsFeedResponse(load: () => PriceDropsPayload): Response {
  try {
    return new Response(buildPriceDropsFeed(load()), { headers: PRICE_DROPS_FEED_HEADERS });
  } catch {
    return new Response("Price drops feed unavailable\n", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
}

export function buildPriceDropsFeed(payload: PriceDropsPayload): string {
  const pageUrl = buildAbsoluteUrl(PRICE_DROPS_PAGE_PATH);
  const feedUrl = buildAbsoluteUrl(PRICE_DROPS_FEED_PATH);
  const subtitle =
    payload.drops.length === 0
      ? "Sin bajas por encima de los umbrales publicados en el último refresh del catálogo."
      : `${payload.totalDrops} bajas detectadas en el refresh del ${payload.date}, ordenadas por variación porcentual.`;

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="es-AR">',
    `  <title>${escapeXml(PRICE_DROPS_FEED_TITLE)}</title>`,
    `  <id>${escapeXml(pageUrl)}</id>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(pageUrl)}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(feedUrl)}"/>`,
    `  <updated>${escapeXml(payload.generatedAt)}</updated>`,
    `  <subtitle>${escapeXml(subtitle)}</subtitle>`,
    "  <author>",
    "    <name>ofertasSUPER</name>",
    "  </author>",
    ...payload.drops.map(entry),
    "</feed>",
    "",
  ].join("\n");
}
