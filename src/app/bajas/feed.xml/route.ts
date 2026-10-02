import { loadPriceDrops } from "@/lib/price-drops";
import { priceDropsFeedResponse } from "@/lib/price-drops-feed";

// Atom feed over the committed price-drops payload. Readers poll on their own
// schedule, so the response is rendered per request from the committed file;
// an unreadable payload fails closed with 503 instead of an invented feed.

export const dynamic = "force-dynamic";

export function GET(): Response {
  return priceDropsFeedResponse(loadPriceDrops);
}
