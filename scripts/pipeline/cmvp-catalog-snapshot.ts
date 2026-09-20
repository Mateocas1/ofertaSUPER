import type { CmvpCatalogSnapshot, CmvpTargetManifest } from "./cmvp-catalog-gate";
import { normalizeEan } from "./cmvp-catalog-gate";

export type { CmvpTargetManifest } from "./cmvp-catalog-gate";

const SOURCES = ["carrefour", "disco", "jumbo"] as const;
type Source = (typeof SOURCES)[number];
type OptionalAttribute = "pack" | "quantity" | "measurementUnit" | "variant";
type ObservedAttributes = Record<OptionalAttribute, string | null>;

export type CmvpCatalogSnapshotRow = { source: string; productEan: string; sourceSku?: string | null; available: boolean; price: number | null; observedAt: string };
export type CmvpSourceIdentityEvidence = { source: Source; ean?: string | null; sourceSku?: string; pack?: string | null; quantity?: string | null; measurementUnit?: string | null; variant?: string | null };
export type CmvpCatalogSnapshotRepository = { listOffers(input: { sources: Source[]; productEans: string[] }): Promise<CmvpCatalogSnapshotRow[]> };
export type CmvpGeneratedCatalogSnapshot = CmvpCatalogSnapshot & { readOnly: true; identity: { missingStructuredEvidenceIsUnproven: false; attributeConflicts: Array<{ source: Source; ean: string; attributes: OptionalAttribute[] }> } };

export async function buildCmvpCatalogSnapshot({ targetManifest, repository, observedAt, identityEvidence = [] }: { targetManifest: CmvpTargetManifest; repository: CmvpCatalogSnapshotRepository; observedAt: string; identityEvidence?: CmvpSourceIdentityEvidence[] }): Promise<CmvpGeneratedCatalogSnapshot> {
	const targets = targetManifest.products
		.filter((product): product is typeof product & { ean: string } => product.useful && Boolean(normalizeEan(product.ean)))
		.toSorted((left, right) => left.targetId.localeCompare(right.targetId));
	const targetByEan = new Map(targets.map((target) => [normalizeEan(target.ean)!, target]));
	const evidence = indexIdentityEvidence(identityEvidence);
	const rows = await repository.listOffers({ sources: [...SOURCES], productEans: [...targetByEan.keys()].toSorted() });
	const unsortedOffers = rows.filter((row): row is CmvpCatalogSnapshotRow & { source: Source } => SOURCES.includes(row.source as Source)).flatMap((row) => {
		const normalizedEan = normalizeEan(row.productEan); const target = normalizedEan ? targetByEan.get(normalizedEan) : null;
		if (!target || !normalizedEan) return [];
		const attributes = evidence.observations.get(`${row.source}:${normalizedEan}`) ?? nullAttributes();
		return [{ source: row.source, targetId: target.targetId, ean: normalizedEan, ...attributes, available: row.available, price: row.price, observedAt: row.observedAt }];
	});
	ensureUniqueNormalizedSourceIdentities(unsortedOffers);
	const offers = unsortedOffers.toSorted(compareSnapshotOffers);
	return { schemaVersion: 1, cycleId: targetManifest.cycleId, observedAt, offers, readOnly: true, identity: { missingStructuredEvidenceIsUnproven: false, attributeConflicts: evidence.conflicts } };
}

function indexIdentityEvidence(evidence: CmvpSourceIdentityEvidence[]) {
	const observations = new Map<string, ObservedAttributes>();
	const conflicts = new Map<string, Set<OptionalAttribute>>();
	for (const item of evidence) {
		if (!SOURCES.includes(item.source)) continue;
		const normalizedEan = normalizeEan(item.ean); if (!normalizedEan) continue;
		const key = identityKey(item.source, normalizedEan); if (!key) continue;
		const next = attributesFrom(item); const previous = observations.get(key) ?? nullAttributes(); const merged = { ...previous };
		for (const attribute of ["pack", "quantity", "measurementUnit", "variant"] as const) {
			const value = next[attribute];
			if (value === null) continue;
			if (previous[attribute] !== null && normalize(previous[attribute]) !== normalize(value)) { const fields = conflicts.get(key) ?? new Set<OptionalAttribute>(); fields.add(attribute); conflicts.set(key, fields); merged[attribute] = null; }
			else if (!conflicts.get(key)?.has(attribute)) merged[attribute] = value;
		}
		observations.set(key, merged);
	}
	return { observations, conflicts: [...conflicts.entries()].map(([key, attributes]) => { const [source, ean] = key.split(":", 2) as [Source, string]; return { source, ean, attributes: [...attributes].toSorted() }; }).toSorted((left, right) => `${left.source}:${left.ean}`.localeCompare(`${right.source}:${right.ean}`)) };
}
function attributesFrom(item: CmvpSourceIdentityEvidence): ObservedAttributes { return { pack: optional(item.pack), quantity: optional(item.quantity), measurementUnit: optional(item.measurementUnit), variant: optional(item.variant) }; }
function nullAttributes(): ObservedAttributes { return { pack: null, quantity: null, measurementUnit: null, variant: null }; }
function optional(value: string | null | undefined) { const normalized = value?.trim(); return normalized || null; }
function normalize(value: string) { return value.trim().toLocaleLowerCase("en-US"); }
function identityKey(source: string, ean: string | null) { return ean ? `${source}:${ean}` : null; }
function ensureUniqueNormalizedSourceIdentities(offers: Array<{ source: Source; ean: string }>) { const identities = offers.map((offer) => `${offer.source}:${offer.ean}`); if (new Set(identities).size !== identities.length) throw new Error("duplicate normalized source identity"); }
function compareSnapshotOffers(left: CmvpGeneratedCatalogSnapshot["offers"][number], right: CmvpGeneratedCatalogSnapshot["offers"][number]) { const leftKey = JSON.stringify(left); const rightKey = JSON.stringify(right); return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0; }
