import axios from "axios";

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

export function extractSimplePromotionFromPayload(payload: unknown): SimplePromotion | null {
	for (const record of recordsOf(payload)) {
		const teasers = record.PromotionTeasers;
		if (!Array.isArray(teasers)) continue;
		for (const teaser of teasers) {
			const name = teaser && typeof teaser === "object" ? (teaser as Record<string, unknown>).Name : null;
			if (typeof name !== "string") continue;
			const promo = parseSimplePromotion(name);
			if (promo) return promo;
		}
	}
	return null;
}

export async function fetchSimplePromotionByEan(
	baseUrl: string,
	ean: string,
	dependencies: PromoCaptureDependencies = {},
): Promise<SimplePromotion | null> {
	const http = dependencies.http ?? defaultHttp(baseUrl);
	const url = new URL("/api/catalog_system/pub/products/search", baseUrl);
	url.search = `fq=alternateIds_Ean:${encodeURIComponent(ean)}`;
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
	const payload: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
	return extractSimplePromotionFromPayload(payload);
}
