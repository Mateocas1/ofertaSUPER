export type DetailedCategory = {
  name: string;
  slug: string;
  keywords: string[];
};

export const DETAILED_CATEGORIES: DetailedCategory[] = [
  { name: "Almacén", slug: "almacen", keywords: ["arroz", "fideos", "harina", "azucar"] },
  { name: "Bebidas", slug: "bebidas", keywords: ["agua", "gaseosa", "jugo", "cerveza"] },
  { name: "Lácteos", slug: "lacteos", keywords: ["leche", "yogur", "queso", "manteca"] },
  { name: "Carnes", slug: "carnes", keywords: ["carne", "pollo", "cerdo", "hamburguesa"] },
  { name: "Frutas y Verduras", slug: "frutas-verduras", keywords: ["banana", "manzana", "papa", "tomate"] },
  { name: "Limpieza", slug: "limpieza", keywords: ["lavandina", "detergente", "jabon", "suavizante"] },
  { name: "Higiene Personal", slug: "higiene-personal", keywords: ["shampoo", "desodorante", "jabon", "papel higienico"] },
  { name: "Bebés", slug: "bebes", keywords: ["pañales", "toallitas", "mamadera", "talco"] },
  { name: "Mascotas", slug: "mascotas", keywords: ["alimento perro", "alimento gato", "piedras", "snack"] },
  { name: "Congelados", slug: "congelados", keywords: ["helado", "verdura congelada", "pizza", "medallon"] },
  { name: "Desayuno y Merienda", slug: "desayuno-merienda", keywords: ["yerba", "cafe", "te", "galletitas"] },
  { name: "Panadería", slug: "panaderia", keywords: ["pan", "facturas", "tostadas", "prepizza"] },
  { name: "Perfumería", slug: "perfumeria", keywords: ["crema", "maquillaje", "algodon", "quita esmalte"] },
  { name: "Electro Hogar", slug: "electro-hogar", keywords: ["lampara", "pilas", "cargador", "extension"] },
  { name: "Sin TACC", slug: "sin-tacc", keywords: ["sin tacc", "celiaco", "arroz integral", "galletas arroz"] },
];

export const DEFAULT_SEARCH_TERMS = Array.from(
  new Set(DETAILED_CATEGORIES.flatMap((category) => category.keywords)),
);

export function inferCategoryFromText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = text.toLowerCase();

  for (const category of DETAILED_CATEGORIES) {
    if (category.keywords.some((keyword) => normalized.includes(keyword))) {
      return category.name;
    }
  }

  return null;
}