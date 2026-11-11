import { formatDate, formatDateWithYear } from "@/lib/format";

// Copy of the home page. Every number the home shows comes from the committed
// snapshot, the price-drops payload or the basket index; this file only holds
// words and the helpers that put those numbers into sentences.

export const HOME_HERO = {
	heading: "Cuánto sale el mismo producto en cada súper.",
	body: "Buscá por nombre, marca o código de barras y compará los precios registrados, con el supermercado y la fecha de cada uno.",
	searchLabel: "Buscar producto",
	searchPlaceholder: "Leche, yerba, arroz, aceite…",
	searchAction: "Buscar",
	quickSearchesLabel: "Probá con",
	quickSearches: ["leche", "yerba", "arroz", "aceite"],
	unavailable: "El catálogo no está disponible: no se muestran precios ni fechas de relevamiento.",
} as const;

export const HOME_PRICE_DROPS = {
	title: "Bajaron de precio",
	body: "Contra el precio anterior registrado del mismo producto en el mismo supermercado.",
	action: "Ver todas las bajas",
	feedLabel: "Feed Atom",
	dropped: "Bajó",
	previousPrice: "Antes",
	empty: "El último relevamiento no registró bajas por encima de los umbrales publicados.",
	unavailable: "El archivo de bajas no está disponible, así que no se muestra ningún movimiento.",
	imageFallback: "Sin foto",
} as const;

export const HOME_BASKET = {
	title: "Canasta básica",
	body: "Los mismos productos todos los días, una unidad de cada uno, sumados por supermercado.",
	columns: { store: "Supermercado", coverage: "Productos", total: "Total" },
	cheapestComplete: "La más barata completa",
	complete: "Completa",
	incomplete: "Incompleta",
	noComplete:
		"Ningún supermercado tiene precio registrado para todos los productos, así que ningún total se marca como el más barato.",
	incompleteNote: "Un total con menos productos no se compara con uno completo.",
	linesSummary: "Precio más bajo de cada producto",
	noPrice: "Sin precio registrado",
	staleOnly:
		"Los precios de la canasta tienen más de 24 horas, así que no se suman hasta el próximo relevamiento.",
	footnote: "Solo se suman precios relevados en las últimas 24 horas. Verificá en el supermercado antes de comprar.",
	methodLink: "Cómo evoluciona esta canasta",
	ownBasketLink: "Armá tu propia canasta",
	unavailable: "El catálogo no está disponible, así que la canasta no se calcula y no se muestran totales.",
} as const;

const listFormatter = new Intl.ListFormat("es", { type: "conjunction" });
const countFormatter = new Intl.NumberFormat("es-AR");

/** "Precios relevados el 4 nov 2026 en Carrefour, Coto y Vea · 24.948 productos". */
export function provenanceLine(generatedAt: string, supermarkets: readonly string[], productCount: number): string {
	const where = supermarkets.length > 0 ? ` en ${listFormatter.format(supermarkets)}` : "";
	const noun = productCount === 1 ? "producto" : "productos";
	return `Precios relevados el ${formatDateWithYear(generatedAt)}${where} · ${countFormatter.format(productCount)} ${noun}`;
}

/** "Ver las 100 bajas". */
export function dropsActionLabel(count: number): string {
	return count === 1 ? "Ver la baja" : `Ver las ${countFormatter.format(count)} bajas`;
}

/** "9 de 12 productos". */
export function basketCoverageLabel(covered: number, itemCount: number): string {
	const { ratio, noun } = basketCoverageParts(covered, itemCount);
	return `${ratio} ${noun}`;
}

/** The ratio and the noun apart, so narrow screens can drop the noun under its column header. */
export function basketCoverageParts(covered: number, itemCount: number): { ratio: string; noun: string } {
	return { ratio: `${covered} de ${itemCount}`, noun: itemCount === 1 ? "producto" : "productos" };
}

/** "12 productos fijos". */
export function basketSizeLabel(itemCount: number): string {
	return `${itemCount} ${itemCount === 1 ? "producto fijo" : "productos fijos"}`;
}

/** "Incompleta: faltan 3", "Incompleta: falta 1". */
export function basketMissingLabel(missing: number): string {
	return `${HOME_BASKET.incomplete}: ${missing === 1 ? "falta 1" : `faltan ${missing}`}`;
}

/** "Relevado el 4 nov". */
export function observedLabel(iso: string): string {
	return `Relevado el ${formatDate(iso)}`;
}

/** Every user-facing string of the home, static copy plus the shapes of the generated sentences. */
export function getApprovedHomeCopy(): string[] {
	return [
		...Object.values(HOME_HERO).flat(),
		...Object.values(HOME_PRICE_DROPS),
		...Object.values(HOME_BASKET).flatMap((value) => (typeof value === "string" ? [value] : Object.values(value))),
		provenanceLine("2026-11-04T19:00:00.000Z", ["Carrefour", "Coto", "Disco", "Jumbo", "Vea"], 24948),
		dropsActionLabel(100),
		basketCoverageLabel(9, 12),
		basketSizeLabel(12),
		basketMissingLabel(3),
		observedLabel("2026-11-04T19:00:00.000Z"),
	];
}
