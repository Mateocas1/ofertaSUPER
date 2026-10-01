import axios from "axios";

import { gtinLookupForms, normalizeGtin } from "../identity/gtin";
import { parseSimplePromotion, type SimplePromotion } from "./simple-promos";

export type { SimplePromotion };

// Gate 6: promotion capture for Carrefour. Reads the public REST catalog
// search by EAN (no persisted hash needed) and keeps only promotions the
// strict parser recognizes. A failed read is raised to the caller, which
// stores null, keeps the price, and counts the failure in the run summary.

export type VtexPromoHttpClient = {
	get: (url: string, request: {
		headers: {
			"user-agent": string;
			"accept-language": string;
			referer: string;
			origin: string;
		};
		transformResponse: [(value: string) => string];
		responseType: "text";
		timeout: number;
	}) => Promise<{ data: unknown; status: number; headers: { "content-type"?: unknown } }>;
};

type PromoCaptureDependencies = {
	http?: VtexPromoHttpClient;
};

function defaultHttp(baseUrl: string) {
	const origin = new URL(baseUrl).origin;
	return axios.create({
		headers: {
			"user-agent": "Mozilla/5.0 (X11; Linux x86_64) ofertaSUPER capture/1.0",
			"accept-language": "es-AR,es;q=0.9,en;q=0.7",
			referer: `${origin}/`,
			origin,
		},
		transformResponse: [(value: string) => value],
		responseType: "text",
		timeout: 15_000,
	});
}

function recordsOf(payload: unknown): Record<string, unknown>[] {
	return Array.isArray(payload) ? payload.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function sellerTeasers(record: Record<string, unknown>, ean: string | null): Record<string, unknown>[] {
	const items = Array.isArray(record.items) ? record.items.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
	const key = ean === null ? null : normalizeGtin(ean) ?? ean;
	const matchingItems = items.filter((item) => key === null || (typeof item.ean === "string" && (normalizeGtin(item.ean) ?? item.ean) === key));
	const teasers: Record<string, unknown>[] = [];
	for (const item of matchingItems) {
		const sellers = Array.isArray(item.sellers) ? item.sellers.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
		for (const seller of sellers) {
			const offer = seller.commertialOffer && typeof seller.commertialOffer === "object" ? (seller.commertialOffer as Record<string, unknown>) : {};
			if (Array.isArray(offer.PromotionTeasers)) {
				teasers.push(...offer.PromotionTeasers.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object"));
			}
		}
	}
	return teasers;
}

// VTEX nests the teasers under items[].sellers[].commertialOffer of the item
// whose EAN matches the search; the first teaser may be a card promotion, so
// the strict parser decides which one is kept.
export function extractSimplePromotionFromPayload(payload: unknown, ean: string | null = null): SimplePromotion | null {
	for (const record of recordsOf(payload)) {
		for (const teaser of sellerTeasers(record, ean)) {
			const name = teaser.Name;
			if (typeof name !== "string") continue;
			const promo = parseSimplePromotion(name);
			if (promo) return promo;
		}
	}
	return null;
}

async function fetchSearchPayloadByForm(http: VtexPromoHttpClient, baseUrl: string, form: string): Promise<unknown> {
	const url = new URL("/api/catalog_system/pub/products/search", baseUrl);
	url.search = `fq=alternateIds_Ean:${encodeURIComponent(form)}`;
	const response = await http.get(url.toString(), {
		headers: {
			"user-agent": "Mozilla/5.0 (X11; Linux x86_64) ofertaSUPER capture/1.0",
			"accept-language": "es-AR,es;q=0.9,en;q=0.7",
			referer: `${new URL(baseUrl).origin}/`,
			origin: new URL(baseUrl).origin,
		},
		transformResponse: [(value: string) => value],
		responseType: "text",
		timeout: 15_000,
	});

	const raw = response.data;
	return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// Stored keys are canonical GTIN-14; sources publish the short form, so each
// lookup form is tried in order until one returns products.
export async function fetchSearchPayloadByEan(
	baseUrl: string,
	ean: string,
	dependencies: PromoCaptureDependencies = {},
): Promise<unknown> {
	const http = dependencies.http ?? defaultHttp(baseUrl);
	const forms = gtinLookupForms(ean);
	let payload: unknown = [];
	for (const form of forms.length > 0 ? forms : [ean]) {
		payload = await fetchSearchPayloadByForm(http, baseUrl, form);
		if (recordsOf(payload).length > 0) return payload;
	}
	return payload;
}

export async function fetchSimplePromotionByEan(
	baseUrl: string,
	ean: string,
	dependencies: PromoCaptureDependencies = {},
): Promise<SimplePromotion | null> {
	const payload = await fetchSearchPayloadByEan(baseUrl, ean, dependencies);
	return extractSimplePromotionFromPayload(payload, ean);
}
