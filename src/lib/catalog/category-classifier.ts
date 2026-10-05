import type { DETAILED_CATEGORIES } from "../vtex/categories";

// Product category classification (#568). The app shows exactly the 15
// categories of DETAILED_CATEGORIES, so every product must land on one of them
// (or on none). The store already says where a product belongs: its category
// path ("Almacén / Aceites y Vinagres / Aceites Comunes", Coto's "Frescos /
// Lácteos / Leches"), which is far more reliable than guessing from the name
// ("Jabón Líquido Leche De Coco" is not dairy, "Aceite" is not tea). So the
// path decides first, from its most specific segment up to its department;
// only a product without a usable path falls back to whole words of its name.

type CategoryName = (typeof DETAILED_CATEGORIES)[number]["name"];

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Ordered rules: the first category whose pattern matches a segment wins, so
// the narrow categories come before the broad ones ("vegetales congelados" is
// Congelados before Frutas y Verduras; "cuidado del bebe" is Bebés before
// Higiene Personal; "infusiones" is Desayuno before Almacén). Patterns match
// whole words (a trailing "*" allows any ending: "galletit*" covers
// galletitas). Order matters, keep it.
const PATH_RULES: Array<[CategoryName, string[]]> = [
  ["Higiene Personal", ["panales para adultos", "incontinencia"]],
  ["Bebés", ["bebe*", "panal*", "maternal", "maternidad", "infantil*", "pelela*", "chupete*", "mamadera*"]],
  ["Mascotas", ["mascota*", "perro*", "gato*", "animales", "felino*", "canino*", "piedras sanitarias"]],
  ["Sin TACC", ["sin tacc", "libre de gluten", "celiac*"]],
  ["Congelados", ["congelad*", "helado*", "hielo"]],
  ["Higiene Personal", ["higiene", "cuidado bucal", "bucal", "dental", "cuidado del cabello", "cuidado capilar", "capilar", "shampoo*", "acondicionador*", "desodorante*", "antitranspirante*", "proteccion femenina", "femenina", "afeitado", "depilacion", "papel higienico", "panuelo*", "jabon de tocador", "jabones de tocador", "jabones", "jabon"]],
  ["Perfumería", ["perfumeria", "farmacia", "cuidado personal", "cuidado corporal", "cuidado facial", "maquillaje", "cosmetica", "fragancia*", "perfume*", "botiquin", "protector solar", "proteccion solar", "repelente*", "algodon*"]],
  ["Limpieza", ["limpieza", "lavado", "lavandina*", "detergente*", "suavizante*", "insecticida*", "desinfectante*", "limpiador*", "lustramueble*", "aromatizante*", "desodorante de ambiente", "desodorantes de ambiente", "papeles", "rollos de cocina", "servilleta*", "bolsas de residuos", "accesorios de limpieza"]],
  ["Desayuno y Merienda", ["desayuno*", "merienda*", "infusion*", "yerba*", "cafe*", "te", "tes", "mate cocido", "galletit*", "bizcocho*", "tostada*", "cereal*", "mermelada*", "dulce de leche", "cacao*", "chocolatada*", "budin*", "bizcochuelo*", "magdalena*", "endulzante*", "edulcorante*", "azucar*"]],
  ["Lácteos", ["lacteo*", "leche*", "yogur*", "queso*", "manteca*", "crema de leche", "postres lacteos", "margarina*", "huevo*"]],
  ["Carnes", ["carne*", "vacun*", "pollo*", "cerdo*", "porcino*", "cordero*", "granja", "aves", "menudencia*", "achura*", "embutido*", "fiambre*", "salchicha*", "hamburguesa*", "milanesa*", "pescado*", "marisco*", "mariscos", "pescaderia", "carniceria"]],
  ["Frutas y Verduras", ["fruta*", "verdura*", "hortaliza*", "vegetal*", "ensalada*", "frutos secos", "legumbres frescas", "hongos", "verduleria"]],
  ["Panadería", ["panaderia", "pasteleria", "panificado*", "panes", "pan", "facturas", "prepizza*", "tapas", "pastas frescas", "rotiseria", "comidas preparadas", "comidas elaboradas", "comidas refrigeradas", "platos principales", "listos para", "elaboracion"]],
  ["Bebidas", ["bebida*", "gaseosa*", "agua*", "jugo*", "cerveza*", "vino*", "espumante*", "sidra*", "licor*", "aperitivo*", "fernet*", "whisky*", "vodka*", "gin", "isotonica*", "energizante*", "amargo*", "soda*", "bodega"]],
  ["Electro Hogar", ["electro*", "pila*", "lampara*", "iluminacion", "tecnologia", "electrodomestico*"]],
  ["Almacén", ["almacen", "aceite*", "vinagre*", "conserva*", "enlatado*", "pasta*", "fideo*", "arroz*", "legumbre*", "harina*", "condimento*", "especia*", "aderezo*", "salsa*", "mayonesa*", "snack*", "golosina*", "chocolate*", "caramelo*", "alfajor*", "sopa*", "caldo*", "pure*", "encurtido*", "aceituna*", "rebozador*", "polvo*", "reposteria", "frutos", "semilla*", "almacen saludable", "dulce*"]],
];

function patternFor(word: string) {
  const open = word.endsWith("*");
  const body = (open ? word.slice(0, -1) : word).split(" ").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(" ");
  return new RegExp(`(?:^| )${body}${open ? "[a-z]*" : ""}(?= |$)`);
}

const COMPILED = PATH_RULES.map(([category, words]) => [category, words.map(patternFor)] as const);

function categoryOfText(text: string): CategoryName | null {
  const folded = fold(text);
  if (!folded) return null;
  for (const [category, patterns] of COMPILED) {
    if (patterns.some((pattern) => pattern.test(folded))) return category;
  }
  return null;
}

/** "/Almacén/Aceites y Vinagres/Aceites Comunes/" -> ["Almacén", "Aceites y Vinagres", "Aceites Comunes"]. */
export function splitCategoryPath(path: string | null | undefined): string[] {
  return (path ?? "").split("/").map((segment) => segment.trim()).filter(Boolean);
}

// A product without a usable path is classified by whole words of its name
// with the same ordered rules ("Jabón ... Leche De Coco" is soap before it is
// milk, "Aceite" never reads as "te").
function categoryOfName(name: string): CategoryName | null {
  return categoryOfText(name);
}

// Some store departments settle the category whatever their subcategory says:
// everything under "Limpieza" is cleaning (its "Jabones para la ropa" are not
// personal soap), everything under "Mundo Bebé" is for babies (its "Jabones"
// too), everything under "Congelados" is frozen (its hamburgers too).
const DECISIVE_DEPARTMENTS: Record<string, CategoryName> = {
  limpieza: "Limpieza",
  bebidas: "Bebidas",
  mascotas: "Mascotas",
  congelados: "Congelados",
  "mundo bebe": "Bebés",
  lacteos: "Lácteos",
};

// The store path decides: a decisive department first, then the most specific
// segment up to the department; the name is the fallback when the path is
// missing or says nothing the rules know.
export function classifyProductCategory({ name, storePath }: { name: string | null | undefined; storePath?: string[] | null }): CategoryName | null {
  const segments = storePath ?? [];
  const decisive = segments.length > 0 ? DECISIVE_DEPARTMENTS[fold(segments[0]!)] : undefined;
  if (decisive) return decisive;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const category = categoryOfText(segments[index]!);
    if (category) return category;
  }
  return name ? categoryOfName(name) : null;
}
