import { fetchSearchPayloadByEan } from "../promotions/capture";
import { normalizeVtexCatalogPayload } from "./client";

// Gate 6 top-up: offers the daily searches missed are re-read by EAN through
// the public REST search of their supermarket. A product that is found yields
// a fresh offer with its observed price; one that is absent or out of stock
// is recorded as unavailable with no price (never invented). Read failures
// are raised to the caller, which leaves the offer untouched and counts them.

export type TopUpObservation = {
	found: boolean;
	price: number | null;
	listPrice: number | null;
	isAvailable: boolean;
	productUrl: string | null;
};

function asPrice(value: number | null): number | null {
	return value !== null && value > 0 ? value : null;
}

export function topUpObservationFor(payload: unknown, ean: string, baseUrl: string): TopUpObservation {
	const product = normalizeVtexCatalogPayload(payload, baseUrl).find((entry) => entry.ean === ean);
	if (!product) {
		return { found: false, price: null, listPrice: null, isAvailable: false, productUrl: null };
	}

	// An out-of-stock product is observed as unavailable; a zero price is not
	// a price, so the row records "no price observed" instead.
	const available = product.isAvailable && product.price !== null;
	return {
		found: true,
		price: available ? asPrice(product.price) : null,
		listPrice: available ? asPrice(product.listPrice) : null,
		isAvailable: available,
		productUrl: product.productUrl,
	};
}

export type TopUpRead = {
	ok: boolean;
	observation: TopUpObservation | null;
	payload: unknown;
};

// A failed read leaves the offer untouched (no staging row) and is counted by
// the caller; a successful one returns the observation and the payload so the
// Carrefour capture can also extract the promotion.
export async function readTopUpOffer(
	baseUrl: string,
	ean: string,
	dependencies: Parameters<typeof fetchSearchPayloadByEan>[2] = {},
): Promise<TopUpRead> {
	try {
		const payload = await fetchSearchPayloadByEan(baseUrl, ean, dependencies);
		return { ok: true, observation: topUpObservationFor(payload, ean, baseUrl), payload };
	} catch {
		return { ok: false, observation: null, payload: null };
	}
}
