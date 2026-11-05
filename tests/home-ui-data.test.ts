import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
	HOME_BASKET,
	HOME_HERO,
	HOME_PRICE_DROPS,
	basketCoverageLabel,
	basketMissingLabel,
	dropsActionLabel,
	getApprovedHomeCopy,
	provenanceLine,
} from "../src/lib/home-ui-data";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const OVERWHELMING_COPY_PATTERN =
	/\b(dashboard|cockpit|fase|pipeline|instrumentaci[oó]n|observabilidad|production-ready|deploy|promos cargadas|hub|delta|refresh|list price)\b/i;
const PUBLIC_RED_FLAG_PATTERN =
	/\b(demo|mvp|prototype|prototipo|wip|not production-ready|blocked|pending|pendiente|v1|development|desarrollo|mercado vivo|precio actual|precios actuales|precio real|en vivo|última semana|ultima semana|actualizado hoy|hoy)\b/i;
const MISLEADING_CURRENT_CLAIM = /6 fuentes configuradas|último registro disponible|datos con fecha visible/i;
// The home used to be mostly made-up numbers with disclaimers. Nothing on it may be an example any more.
const ILLUSTRATIVE_PATTERN = /ilustrativ|ejemplo|\bDIA\b/i;
const JARGON_PATTERN = /\bEAN\b|comparaci[oó]n por/i;

const HOME_SOURCES = [
	"src/app/page.tsx",
	"src/lib/home-ui-data.ts",
	"src/components/home/home-hero.tsx",
	"src/components/home/home-drops.tsx",
	"src/components/home/home-basket.tsx",
	"src/components/product-thumb.tsx",
] as const;

const read = (path: string) => readFileSync(path, "utf8");

describe("honest home copy", () => {
	it("keeps a single concrete headline and the four quick searches", () => {
		assert.equal(HOME_HERO.heading, "Cuánto sale el mismo producto en cada súper.");
		// One sentence, not a slogan triad.
		assert.equal(HOME_HERO.heading.split(".").filter((part) => part.trim().length > 0).length, 1);
		assert.deepEqual(HOME_HERO.quickSearches, ["leche", "yerba", "arroz", "aceite"]);
		assert.equal(HOME_HERO.searchAction, "Buscar");
	});

	it("words the drops and the basket honestly", () => {
		assert.equal(HOME_PRICE_DROPS.title, "Bajaron de precio");
		assert.equal(HOME_PRICE_DROPS.dropped, "Bajó");
		assert.equal(HOME_BASKET.title, "Canasta básica");
		assert.equal(HOME_BASKET.cheapestComplete, "La más barata completa");
		assert.match(HOME_BASKET.noComplete, /ningún total se marca como el más barato/);
		assert.match(HOME_BASKET.incompleteNote, /no se compara con uno completo/);
		assert.match(HOME_BASKET.unavailable, /no se muestran totales/);
		assert.match(HOME_HERO.unavailable, /no está disponible/);
	});

	it("builds the generated sentences from real numbers without inventing a date", () => {
		assert.equal(
			provenanceLine("2026-11-04T19:14:31.026Z", ["Carrefour", "Coto", "Disco", "Jumbo", "Vea"], 24948),
			"Precios relevados el 4 nov 2026 en Carrefour, Coto, Disco, Jumbo y Vea · 24.948 productos",
		);
		// A late-evening UTC instant is still the same Buenos Aires day it was observed.
		assert.match(provenanceLine("2026-11-05T02:00:00.000Z", ["Coto"], 1), /^Precios relevados el 4 nov 2026 en Coto · 1 producto$/);
		assert.equal(dropsActionLabel(100), "Ver las 100 bajas");
		assert.equal(basketCoverageLabel(12, 12), "12 de 12 productos");
		assert.equal(basketMissingLabel(1), "Incompleta: falta 1");
		assert.equal(basketMissingLabel(3), "Incompleta: faltan 3");
	});

	it("keeps every home string free from current-data claims, jargon, emoji and examples", () => {
		const copy = getApprovedHomeCopy().join(" ");

		assert.doesNotMatch(copy, EMOJI_PATTERN);
		assert.doesNotMatch(copy, OVERWHELMING_COPY_PATTERN);
		assert.doesNotMatch(copy, PUBLIC_RED_FLAG_PATTERN);
		assert.doesNotMatch(copy, MISLEADING_CURRENT_CLAIM);
		assert.doesNotMatch(copy, ILLUSTRATIVE_PATTERN);
		assert.doesNotMatch(copy, JARGON_PATTERN);
		assert.match(copy, /Verificá en el supermercado/);
	});
});

describe("home source contract", () => {
	it("keeps the illustrative data and the old navigation out of the home", () => {
		for (const path of HOME_SOURCES) {
			const source = read(path);
			assert.doesNotMatch(source, /SMART_BASKET|HOME_PRODUCT_ROWS|MARKET_PULSE_ITEMS|HOME_HEADER_NAV|signals/, path);
			assert.doesNotMatch(source, ILLUSTRATIVE_PATTERN, path);
			assert.doesNotMatch(source, EMOJI_PATTERN, path);
		}
	});

	it("follows the design contract: one display H1, no decoration competing with prices", () => {
		const sources = HOME_SOURCES.map(read).join("\n");
		assert.equal((sources.match(/font-display/g) ?? []).length, 1);
		assert.match(read("src/components/home/home-hero.tsx"), /<h1[\s\S]*?font-display/);
		assert.doesNotMatch(sources, /font-mono|\bstagger\b|animate-enter|\bsettle\b|\blift\b|border-dashed|text-\[|wavy|uppercase/);
		assert.doesNotMatch(sources, /<button[^>]*rounded-full/);
		assert.match(read("src/app/page.tsx"), /container-page/);
	});

	it("keeps the search form, ISR and the Atom alternate", () => {
		const hero = read("src/components/home/home-hero.tsx");
		assert.match(hero, /action="\/buscar"/);
		assert.match(hero, /role="search"/);
		assert.match(hero, /aria-label="Buscar productos"/);
		assert.match(hero, /type="search"/);

		const page = read("src/app/page.tsx");
		assert.match(page, /export const revalidate = 21600;/);
		assert.match(page, /"application\/atom\+xml"/);
	});

	it("fails closed: offline mode and an unreadable snapshot render the unavailable state", () => {
		const loader = read("src/lib/home-catalog.ts");
		assert.match(loader, /isCatalogOfflineMode\(\)\) return \{ status: "unavailable" \}/);
		assert.match(loader, /SnapshotUnavailableError/);
		assert.match(loader, /BasketIndexUnavailableError/);
		assert.match(read("src/components/home/home-basket.tsx"), /HOME_BASKET\.unavailable/);
		assert.match(read("src/components/home/home-hero.tsx"), /HOME_HERO\.unavailable/);
		assert.match(read("src/components/home/home-drops.tsx"), /HOME_PRICE_DROPS\.unavailable/);
	});

	it("keeps product photos unoptimized with a calm fallback", () => {
		const thumb = read("src/components/product-thumb.tsx");
		assert.match(thumb, /<Image\s+src=[\s\S]*?\bunoptimized\s*\/>/);
		assert.match(thumb, /onError/);
		// Errors that fire before hydration must also fall back to the placeholder.
		assert.match(thumb, /naturalWidth === 0/);
		assert.match(read("src/components/home/home-drops.tsx"), /<ProductThumb\b/);
	});
});
