import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyProductCategory, splitCategoryPath } from "../src/lib/catalog/category-classifier";
import { normalizeCotoResult } from "../src/lib/coto/client";
import { normalizeProduct } from "../src/lib/vtex/normalize";
import { DETAILED_CATEGORIES } from "../src/lib/vtex/categories";

const byPath = (path: string, name = "Producto") => classifyProductCategory({ name, storePath: splitCategoryPath(path) });

describe("product category classification", () => {
  it("maps the stores' own category paths to the app's categories (paths read live)", () => {
    const cases: Array<[string, string]> = [
      ["/Almacén/Aceites y Vinagres/Aceites Comunes/", "Almacén"],
      ["/Almacén/Desayuno y Merienda/Yerbas/", "Desayuno y Merienda"],
      ["/Desayuno y merienda/Café/Café molido y en grano/", "Desayuno y Merienda"],
      ["/Frescos/Lácteos/Leches/Leches Enteras/", "Lácteos"],
      ["/Lácteos y productos frescos/Fiambres/Fiambres feteados/", "Carnes"],
      ["/Quesos y Fiambres/Quesos/", "Lácteos"],
      ["/Carnes y pescados/Pescados y mariscos/", "Carnes"],
      ["/Congelados/Hamburguesas y medallones/", "Congelados"],
      ["/Limpieza/Limpieza de la ropa/Jabones para la ropa/", "Limpieza"],
      ["/Limpieza/Desodorantes de ambiente/Antihumedad/", "Limpieza"],
      ["/Perfumería/Cuidado Personal/Pañales Para Adultos e Incontinencia/", "Higiene Personal"],
      ["/Perfumería y farmacia/Cuidado del cabello/", "Higiene Personal"],
      ["/Perfumería y farmacia/Cuidado de la piel/Protección solar/", "Perfumería"],
      ["/Mundo Bebé/Higiene para bebés/Jabones/", "Bebés"],
      ["/Mundo Bebe/Bañaderas, Cambiadores y Pelelas/", "Bebés"],
      ["/Mascotas/Alimentos para gatos/Alimentos secos para gatos/", "Mascotas"],
      ["/Almacén/Libre de Gluten/", "Sin TACC"],
      ["/Bebidas/Bebidas blancas/Whisky/", "Bebidas"],
      ["/Frutas y verduras/Verduras/", "Frutas y Verduras"],
      ["/Panadería/Pizzas y prepizzas/", "Panadería"],
    ];
    for (const [path, expected] of cases) assert.equal(byPath(path), expected, path);
  });

  it("only ever answers one of the app's 15 categories, or nothing", () => {
    const names = new Set(DETAILED_CATEGORIES.map((category) => category.name));
    for (const path of ["/Frescos/", "/Sin Categoría/", "/Hogar y textil/Bazar/"]) {
      const category = byPath(path, "Cosa rara");
      assert.ok(category === null || names.has(category), path);
    }
  });

  it("falls back to whole words of the name, never to substrings", () => {
    assert.equal(classifyProductCategory({ name: "Aceite de girasol Natura 1,5 L" }), "Almacén", "'te' inside 'aceite' is not tea");
    assert.equal(classifyProductCategory({ name: "Te Taragüi en saquitos x 25" }), "Desayuno y Merienda");
    assert.equal(classifyProductCategory({ name: "Leche entera La Serenísima 1 L" }), "Lácteos");
    assert.notEqual(classifyProductCategory({ name: "Jabón Líquido Leche De Coco 250 Ml Dove" }), "Lácteos");
    assert.notEqual(classifyProductCategory({ name: "Mousse Casero Dulce De Leche" }), "Lácteos");
  });

  it("places Coto products whose path is only their department (live 2026-10 cases)", () => {
    const shallow = (name: string) => byPath("/Frescos/", name);
    assert.equal(shallow("Ravioles ricota nuez COTO 280g"), "Panadería", "filled pasta is not its ricotta");
    assert.equal(shallow("Sorrentinos Jamón y Queso"), "Panadería", "filled pasta is not its cheese");
    assert.equal(shallow("Ñoquis Remolacha Bja 1 Uni"), "Panadería");
    assert.equal(shallow("Ques.Camembert . Ile De Fran Cja 125 Grm"), "Lácteos");
    assert.equal(shallow("Ques.Muzz.D/Lat Mini Bocconcin WAPI Pou 100 Grm"), "Lácteos");
    assert.equal(shallow("Flan Casero X Uni"), "Lácteos");
    assert.equal(shallow("Leberwurst PALADINI Finas Hierbas Paq 200 Grm"), "Carnes");
    assert.equal(shallow("Mini Salchichón Triple Paladini Uni 300 Grm"), "Carnes");
    assert.equal(shallow("Rucula Rie La Huerta 70g"), "Frutas y Verduras");
    assert.equal(shallow("Hummus ONNEG Red Pepper Hummus 250g"), "Almacén");
    assert.equal(byPath("/Almacén/", "Gelatina Cereza 1u"), "Almacén");
  });

  it("prefers the store path over the name", () => {
    assert.equal(byPath("/Perfumería/Jabones/", "Jabón Líquido Leche De Coco 250 Ml Dove"), "Higiene Personal");
  });

  it("reads the path from VTEX and Coto payloads", () => {
    const vtex = normalizeProduct({
      productName: "Jabón Líquido Leche De Coco 250 Ml Dove",
      categories: ["/Perfumería/", "/Perfumería/Cuidado Personal/Jabones/", "/Perfumería/Cuidado Personal/"],
      items: [{ itemId: "1", ean: "7790000000003", referenceId: [{ Value: "7790000000003" }], sellers: [{ sellerId: "1", commertialOffer: { Price: 1000, ListPrice: 1000, AvailableQuantity: 1 } }] }],
    }, "https://www.example.com");
    assert.equal(vtex?.category, "Higiene Personal");

    const coto = normalizeCotoResult({
      value: "Leche Larga Vida Entera COTO 1 L",
      data: {
        product_main_ean: 7798039600034,
        sku_display_name: "Leche Larga Vida Entera COTO 1 L",
        product_weighable: 0,
        store_availability: ["200"],
        price: [{ store: "200", listPrice: 1599, formatPrice: 1599 }],
        groups: [{ group_id: "catv00004111", display_name: "Leches Enteras", path_list: [{ id: "categoria", display_name: "Categorias" }, { id: "catv00001255", display_name: "Frescos" }, { id: "catv00001295", display_name: "Lácteos" }] }],
      },
    });
    assert.equal(coto?.product.category, "Lácteos");
  });
});
