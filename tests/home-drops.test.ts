import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HOME_DROPS_LIMIT, isEverydayCategory, selectHomeDrops } from "../src/lib/home-drops";
import { loadPriceDrops } from "../src/lib/price-drops";

type Drop = { id: string; ean: string; brand: string | null; category: string | null };

function drop(id: string, category: string | null, brand: string | null, ean = id): Drop {
	return { id, ean, brand, category };
}

const ids = (drops: Drop[]) => drops.map((item) => item.id);

describe("selectHomeDrops", () => {
	it("prefers everyday categories over pets and baby gear, keeping payload order", () => {
		const drops = [
			drop("cat-bed", "Mascotas", "Proline"),
			drop("stroller", "Bebés", "Infanti"),
			drop("milk", "Lácteos", "La Serenísima"),
			drop("rice", "Almacén", "Gallo"),
		];
		assert.deepEqual(ids(selectHomeDrops(drops, 2)), ["milk", "rice"]);
	});

	it("shows one item per brand before repeating a brand", () => {
		const drops = [
			drop("a1", "Almacén", "Marolio"),
			drop("a2", "Almacén", "marolio "),
			drop("b1", "Bebidas", "Coca-Cola"),
			drop("c1", "Limpieza", "Ala"),
		];
		assert.deepEqual(ids(selectHomeDrops(drops, 3)), ["a1", "b1", "c1"]);
	});

	it("falls back to other categories, then to repeated brands, so it fills the limit", () => {
		const drops = [
			drop("pet1", "Mascotas", "Proline"),
			drop("pet2", "Mascotas", "Proline"),
			drop("milk", "Lácteos", "La Serenísima"),
			drop("toy", null, "Juguetes SA"),
		];
		assert.deepEqual(ids(selectHomeDrops(drops, 4)), ["pet1", "pet2", "milk", "toy"]);
		assert.deepEqual(ids(selectHomeDrops(drops, 3)), ["pet1", "milk", "toy"]);
	});

	it("never repeats a product that dropped in two supermarkets", () => {
		const drops = [drop("milk-coto", "Lácteos", null, "777"), drop("milk-vea", "Lácteos", null, "777")];
		assert.deepEqual(ids(selectHomeDrops(drops, 4)), ["milk-coto"]);
	});

	it("treats unbranded drops as distinct brands and matches categories without accents", () => {
		const drops = [drop("x", "Almacen", null), drop("y", "LACTEOS", "")];
		assert.deepEqual(ids(selectHomeDrops(drops, 2)), ["x", "y"]);
		assert.equal(isEverydayCategory("Mascotas"), false);
		assert.equal(isEverydayCategory(null), false);
	});

	it("is deterministic over the committed payload and stays within the limit", () => {
		const { drops } = loadPriceDrops();
		const first = selectHomeDrops(drops);
		assert.deepEqual(selectHomeDrops(drops), first);
		assert.ok(first.length <= HOME_DROPS_LIMIT);
		assert.equal(new Set(first.map((item) => item.ean)).size, first.length);
		if (drops.filter((item) => isEverydayCategory(item.category)).length >= HOME_DROPS_LIMIT) {
			assert.ok(first.every((item) => isEverydayCategory(item.category)));
		}
	});
});
