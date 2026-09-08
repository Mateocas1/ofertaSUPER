import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
	HOME_HEADER_NAV,
	HOME_HERO,
	HOME_PRODUCT_ROWS,
	MARKET_PULSE_ITEMS,
	SMART_BASKET,
	getApprovedHomeCopy,
} from "../src/lib/home-ui-data";

const EMOJI_PATTERN = /\p{Extended_Pictographic}/u;
const OVERWHELMING_COPY_PATTERN =
	/\b(dashboard|cockpit|fase|pipeline|instrumentaci[oó]n|observabilidad|production-ready|deploy|promos cargadas)\b/i;
const PUBLIC_RED_FLAG_PATTERN =
	/\b(demo|mvp|prototype|prototipo|wip|not production-ready|blocked|pending|pendiente|v1|development|desarrollo|mercado vivo|precio actual|precio real|en vivo|última semana|ultima semana)\b/i;
const MISLEADING_CURRENT_CLAIM = /6 fuentes configuradas|último registro disponible|datos con fecha visible/i;

describe("honest home example content", () => {
	it("keeps the approved navigation and search-first hero", () => {
		assert.deepEqual(
			HOME_HEADER_NAV.map((item) => item.label),
			["Inicio", "Buscar", "Ofertas", "Canasta"],
		);
		assert.equal(HOME_HERO.heading, "Compará precios. Armá tu canasta. Comprá mejor.");
		assert.equal(HOME_HERO.searchPlaceholder, "Buscar leche, yerba, arroz, aceite...");
		assert.equal(HOME_HERO.quickSearches.length, 4);
		assert.equal(
			HOME_HERO.body,
			"Buscá productos y compará precios registrados por EAN cuando el catálogo esté disponible.",
		);
		assert.deepEqual(HOME_HERO.signals, [
			"Comparación por EAN",
			"Fecha del registro",
			"Cobertura por supermercado",
		]);
	});

	it("keeps the basket and preview examples complete but explicitly illustrative", () => {
		assert.equal(SMART_BASKET.title, "Canasta ilustrativa");
		assert.equal(SMART_BASKET.summary, "Ejemplo · 4 productos");
		assert.equal(SMART_BASKET.products.length, 4);
		assert.match(SMART_BASKET.ranking[0]?.badge ?? "", /Ejemplo/i);
		assert.equal(SMART_BASKET.ranking.some((item) => item.status === "Falta 1"), true);
		assert.equal(HOME_PRODUCT_ROWS.length, 4);
		assert.deepEqual(
			HOME_PRODUCT_ROWS.map((row) => row.action),
			Array(HOME_PRODUCT_ROWS.length).fill("Buscar producto"),
		);
		assert.equal(MARKET_PULSE_ITEMS.length, 3);
		assert.deepEqual(
			MARKET_PULSE_ITEMS.map((item) => item.title),
			["Referencia de yerba", "Rango de aceite", "Cobertura de leche"],
		);
	});

	it("keeps public copy free from unsupported current-data claims and jargon", () => {
		const copy = getApprovedHomeCopy().join(" ");

		assert.doesNotMatch(copy, EMOJI_PATTERN);
		assert.doesNotMatch(copy, OVERWHELMING_COPY_PATTERN);
		assert.doesNotMatch(copy, PUBLIC_RED_FLAG_PATTERN);
		assert.doesNotMatch(copy, MISLEADING_CURRENT_CLAIM);
		assert.match(copy, /Ejemplo de precios por producto/);
		assert.match(copy, /no son precios actuales/);
		assert.match(copy, /Las líneas son ilustrativas y no representan una serie observada\./);
	});
});
