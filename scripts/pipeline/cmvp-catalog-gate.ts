import { createHash } from "node:crypto";

import { normalizeGtin } from "../../src/lib/identity/gtin";

const SOURCES = ["carrefour", "disco", "jumbo"] as const;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
type Source = (typeof SOURCES)[number];
type GateStatus = "PASS" | "FAIL";
type OptionalAttribute = "pack" | "quantity" | "measurementUnit" | "variant";

type IdentityFields = {
	ean: string | null;
	pack: string | null;
	quantity: string | null;
	measurementUnit: string | null;
	variant: string | null;
};
type AttributeConflict = { source: Source; ean: string; attributes: OptionalAttribute[] };

export type CmvpTargetManifest = { schemaVersion: 1; cycleId: string; frozenAt: string; products: Array<IdentityFields & { targetId: string; useful: boolean }> };
export type CmvpCatalogSnapshot = {
	schemaVersion: 1; cycleId: string; observedAt: string;
	offers: Array<IdentityFields & { source: Source; targetId: string; available: boolean; price: number | null; observedAt: string }>;
	identity?: { attributeConflicts: AttributeConflict[] };
};
export type CmvpPriorCycle = { schemaVersion: 1; cycleId: string; targetFingerprint: string; status: GateStatus };

export function buildCmvpCatalogGateReport({ targetManifest, snapshot, priorCycle = null, now = new Date().toISOString() }: { targetManifest: CmvpTargetManifest; snapshot: CmvpCatalogSnapshot; priorCycle?: CmvpPriorCycle | null; now?: string }) {
	const evaluationTime = validDate(now, "evaluation time");
	validateInput(targetManifest, snapshot, priorCycle, evaluationTime);
	const usefulTargets = targetManifest.products.filter((product) => product.useful).toSorted((left, right) => left.targetId.localeCompare(right.targetId));
	const targetById = new Map(usefulTargets.map((product) => [product.targetId, product]));
	const windowEnd = evaluationTime;
	const windowStart = windowEnd - 24 * 60 * 60 * 1000;
	const targetFingerprint = fingerprint(usefulTargets);
	const exclusions: Array<{ source: Source; targetId: string; reasons: string[] }> = [];
	const exactSources = new Map<string, Set<Source>>();
	const eanSources = new Map<string, Set<Source>>();
	const exactOfferKeys = new Set<string>();

	for (const offer of snapshot.offers) {
		const target = targetById.get(offer.targetId);
		if (!target) throw new Error(`offer targetId ${offer.targetId} is not a useful frozen target`);
		const reasons = identityReasons(target, offer);
		const observed = new Date(offer.observedAt).getTime();
		if (observed < windowStart) reasons.push("outside-24-hour-window");
		if (reasons.length > 0) exclusions.push({ source: offer.source, targetId: offer.targetId, reasons });
		const normalizedOfferEan = normalizeEan(offer.ean);
		if (normalizedOfferEan && normalizedOfferEan === normalizeEan(target.ean)) addSource(eanSources, normalizedOfferEan, offer.source);
		if (identityReasons(target, offer).length === 0) { addSource(exactSources, offer.targetId, offer.source); exactOfferKeys.add(`${offer.source}:${offer.targetId}`); }
	}
	const exactOffers = snapshot.offers.filter((offer) => exactOfferKeys.has(`${offer.source}:${offer.targetId}`));
	const sources = SOURCES.map((source) => {
		const offers = snapshot.offers.filter((offer) => offer.source === source);
		const provenOffers = exactOffers.filter((offer) => offer.source === source);
		return { source, offers: offers.length, represented: provenOffers.length > 0, available: offers.filter((offer) => offer.available).length, priceRankable: offers.filter((offer) => offer.available && offer.price !== null && offer.price > 0).length, withinWindow: provenOffers.filter((offer) => new Date(offer.observedAt).getTime() >= windowStart).length };
	});
	const exactComparableProducts = [...exactSources.values()].filter((values) => values.size >= 2).length;
	const eanCandidateOverlap = [...eanSources.values()].filter((values) => values.size >= 2).length;
	const withinWindow = sources.reduce((sum, source) => sum + source.withinWindow, 0);
	const freshTargetIds = new Set(exactOffers.filter((offer) => new Date(offer.observedAt).getTime() >= windowStart).map((offer) => offer.targetId));
	const freshnessPercent = usefulTargets.length === 0 ? 0 : roundPercent(freshTargetIds.size, usefulTargets.length);
	const gates = { targetSize: usefulTargets.length >= 500 && usefulTargets.length <= 1000, threeSourcesRepresented: sources.every((source) => source.represented), exactComparableProducts: exactComparableProducts >= 100, freshness: freshnessPercent >= 90 };
	const status: GateStatus = Object.values(gates).every(Boolean) ? "PASS" : "FAIL";
	const sameFrozenTarget = priorCycle?.targetFingerprint === targetFingerprint;
	return { schemaVersion: 1 as const, report: "cmvp-catalog-gate" as const, readOnly: true as const, status,
		cycle: { current: targetManifest.cycleId, prior: priorCycle?.cycleId ?? null, targetFingerprint, sameFrozenTarget, consecutiveSuccessful: Boolean(priorCycle && priorCycle.cycleId !== targetManifest.cycleId && priorCycle.status === "PASS" && sameFrozenTarget && status === "PASS") },
		window: { hours: 24 as const, start: new Date(windowStart).toISOString(), end: new Date(windowEnd).toISOString() }, target: { distinctUsefulProducts: usefulTargets.length }, sources,
		identity: { model: "normalized-EAN/GTIN" as const, exactComparableProducts, eanCandidateOverlap, missingStructuredEvidenceIsUnproven: false as const, attributeConflicts: sortConflicts(snapshot.identity?.attributeConflicts ?? []) },
		observations: { total: snapshot.offers.length, withinWindow, freshDistinctUsefulProducts: freshTargetIds.size, freshnessPercent, available: sources.reduce((sum, source) => sum + source.available, 0), priceRankable: sources.reduce((sum, source) => sum + source.priceRankable, 0) },
		exclusions: exclusions.toSorted((left, right) => `${left.source}:${left.targetId}`.localeCompare(`${right.source}:${right.targetId}`)), gates };
}

function validateInput(manifest: CmvpTargetManifest, snapshot: CmvpCatalogSnapshot, prior: CmvpPriorCycle | null, evaluationTime: number) {
	if (manifest.schemaVersion !== 1 || snapshot.schemaVersion !== 1) throw new Error("unsupported schema version");
	if (!manifest.cycleId || snapshot.cycleId !== manifest.cycleId) throw new Error("snapshot cycle must match target manifest cycle");
	const frozenAt = validDate(manifest.frozenAt, "frozenAt"); const observedAt = validDate(snapshot.observedAt, "snapshot observedAt");
	if (observedAt < frozenAt) throw new Error("snapshot observedAt precedes frozen target");
	if (observedAt > evaluationTime + MAX_FUTURE_SKEW_MS) throw new Error("future snapshot observation");
	unique(manifest.products.map((product) => product.targetId), "duplicate targetId"); unique(manifest.products.map((product) => normalizeEan(product.ean)).filter((ean): ean is string => ean !== null), "duplicate normalized target EAN"); unique(snapshot.offers.flatMap((offer) => { const ean = normalizeEan(offer.ean); return ean ? [`${offer.source}:${ean}`] : []; }), "duplicate normalized source identity"); unique(snapshot.offers.map((offer) => `${offer.source}:${offer.targetId}`), "duplicate source+targetId offer");
	for (const product of manifest.products) if (!product.targetId) throw new Error("targetId is required");
	for (const offer of snapshot.offers) { if (!SOURCES.includes(offer.source)) throw new Error(`unsupported source ${offer.source}`); const time = validDate(offer.observedAt, "offer observedAt"); if (time > observedAt || time > evaluationTime + MAX_FUTURE_SKEW_MS) throw new Error("future offer observation"); if (offer.price !== null && (!Number.isFinite(offer.price) || offer.price <= 0)) throw new Error("price must be null or positive"); }
	if (prior && (prior.schemaVersion !== 1 || !prior.cycleId || !["PASS", "FAIL"].includes(prior.status))) throw new Error("invalid prior cycle");
}

function identityReasons(target: IdentityFields, offer: IdentityFields) {
	const normalizedTarget = normalizeEan(target.ean); const normalizedOffer = normalizeEan(offer.ean);
	if (!offer.ean?.trim()) return ["missing-ean"];
	const reasons: string[] = [];
	if (!normalizedOffer) reasons.push("invalid-ean");
	if (!normalizedTarget || normalizedOffer !== normalizedTarget) reasons.push("ean-mismatch");
	return reasons;
}

export const normalizeEan = normalizeGtin;
function sortConflicts(conflicts: AttributeConflict[]) { return conflicts.map((conflict) => ({ ...conflict, attributes: [...conflict.attributes].toSorted() })).toSorted((left, right) => `${left.source}:${left.ean}:${left.attributes.join(",")}`.localeCompare(`${right.source}:${right.ean}:${right.attributes.join(",")}`)); }
function addSource(map: Map<string, Set<Source>>, key: string, source: Source) { const values = map.get(key) ?? new Set<Source>(); values.add(source); map.set(key, values); }
function validDate(value: string, label: string) { const time = new Date(value).getTime(); if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error(`${label} must be an ISO timestamp`); return time; }
function unique(values: string[], message: string) { if (new Set(values).size !== values.length) throw new Error(message); }
function roundPercent(numerator: number, denominator: number) { return Number(((numerator / denominator) * 100).toFixed(2)); }
function fingerprint(products: Array<IdentityFields & { targetId: string }>) { return createHash("sha256").update(JSON.stringify(products.map((product) => ({ targetId: product.targetId, ean: product.ean, pack: product.pack, quantity: product.quantity, measurementUnit: product.measurementUnit, variant: product.variant })))).digest("hex"); }
