// Which of the published price drops the home shows. The payload is sorted by
// percentage, and its top is often pet beds or baby gear from one brand; the
// home is a grocery bulletin, so it prefers everyday categories and one item
// per brand, then falls back to the rest so it never shows fewer than it can.
// Pure and deterministic: same payload, same selection, input order kept.

export const HOME_DROPS_LIMIT = 8;

/** Categories a weekly grocery run covers, as the snapshot names them. */
export const EVERYDAY_DROP_CATEGORIES: readonly string[] = [
	"Almacén",
	"Lácteos",
	"Bebidas",
	"Frutas y Verduras",
	"Carnes",
	"Pescados",
	"Fiambrería",
	"Quesos",
	"Congelados",
	"Panadería",
	"Desayuno y Merienda",
	"Café molido y en grano",
	"Limpieza",
	"Perfumería",
	"Higiene Personal",
];

export type SelectableDrop = {
	ean: string;
	brand: string | null;
	category: string | null;
};

function normalizeLabel(value: string): string {
	return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

const EVERYDAY = new Set(EVERYDAY_DROP_CATEGORIES.map(normalizeLabel));

export function isEverydayCategory(category: string | null): boolean {
	return category !== null && EVERYDAY.has(normalizeLabel(category));
}

// A drop without a brand is its own brand: two unbranded items never collide.
function brandKey(drop: SelectableDrop): string {
	const brand = drop.brand ? normalizeLabel(drop.brand) : "";
	return brand.length > 0 ? `brand:${brand}` : `ean:${drop.ean}`;
}

type Pass = { everydayOnly: boolean; oneBrandEach: boolean };

const PASSES: readonly Pass[] = [
	{ everydayOnly: true, oneBrandEach: true },
	{ everydayOnly: false, oneBrandEach: true },
	{ everydayOnly: false, oneBrandEach: false },
];

function passAccepts(pass: Pass, drop: SelectableDrop, brands: ReadonlySet<string>): boolean {
	if (pass.everydayOnly && !isEverydayCategory(drop.category)) return false;
	return !(pass.oneBrandEach && brands.has(brandKey(drop)));
}

/**
 * Up to `limit` drops: everyday categories with one item per brand first, then
 * any category with one item per brand, then whatever is left. A product (EAN)
 * appears once even when it dropped in several supermarkets. The result keeps
 * the payload order (largest drop first).
 */
export function selectHomeDrops<T extends SelectableDrop>(drops: readonly T[], limit = HOME_DROPS_LIMIT): T[] {
	const chosen = new Set<number>();
	const eans = new Set<string>();
	const brands = new Set<string>();

	for (const pass of PASSES) {
		drops.forEach((drop, position) => {
			if (chosen.size >= limit || chosen.has(position) || eans.has(drop.ean)) return;
			if (!passAccepts(pass, drop, brands)) return;
			chosen.add(position);
			eans.add(drop.ean);
			brands.add(brandKey(drop));
		});
	}

	return [...chosen].sort((left, right) => left - right).map((position) => drops[position]);
}
