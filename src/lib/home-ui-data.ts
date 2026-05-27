export const HOME_HEADER_NAV = [
	{ href: "/", label: "Inicio" },
	{ href: "/buscar", label: "Buscar" },
	{ href: "/ofertas", label: "Ofertas" },
	{ href: "/canasta", label: "Canasta" },
] as const;

export const HOME_HERO = {
	heading: "Compará precios. Armá tu canasta. Comprá mejor.",
	body: "Buscá productos de supermercados argentinos, compará precios por EAN y descubrí dónde conviene resolver tu compra.",
	searchPlaceholder: "Buscar leche, yerba, arroz, aceite...",
	quickSearches: ["leche", "yerba", "arroz", "aceite"],
	signals: ["6 fuentes configuradas", "EAN normalizado", "Frescura visible"],
} as const;

export const SMART_BASKET = {
	title: "Canasta inteligente",
	summary: "4 productos",
	products: [
		{
			name: "Leche entera 1L",
			brand: "La Serenísima Clásica",
			shortLabel: "LE",
			tone: "mint",
		},
		{
			name: "Yerba mate 1kg",
			brand: "Taragüí Tradicional",
			shortLabel: "YM",
			tone: "blue",
		},
		{
			name: "Arroz largo fino 1kg",
			brand: "Gallo Oro",
			shortLabel: "AR",
			tone: "orange",
		},
		{
			name: "Aceite girasol 1,5L",
			brand: "Natura",
			shortLabel: "AC",
			tone: "yellow",
		},
	],
	ranking: [
		{
			supermarket: "Vea",
			mark: "Vea",
			total: "$ 10.847",
			coverage: "4/4 productos",
			status: "Completa",
			badge: "Mejor canasta completa",
			accent: "green",
		},
		{
			supermarket: "Carrefour",
			mark: "C",
			total: "$ 11.236",
			coverage: "4/4 productos",
			status: "Completa",
			accent: "blue",
			badge: null,
		},
		{
			supermarket: "DIA",
			mark: "DIA",
			total: "$ 11.985",
			coverage: "3/4 productos",
			status: "Falta 1",
			accent: "red",
			badge: null,
		},
		{
			supermarket: "Jumbo",
			mark: "Jumbo",
			total: "$ 12.509",
			coverage: "4/4 productos",
			status: "Completa",
			accent: "green",
			badge: null,
		},
	],
	note: "Precios por unidad. Cobertura por EAN.",
} as const;

export const HOME_PRODUCT_ROWS = [
	{
		product: "Leche entera 1L",
		brand: "La Serenísima Clásica",
		shortLabel: "LE",
		tone: "mint",
		minPrice: "$ 1.099",
		supermarket: "Vea",
		range: "$ 1.099 - $ 1.349",
		updatedAt: "Último registro disponible",
		action: "Agregar",
	},
	{
		product: "Yerba mate 1kg",
		brand: "Taragüí Tradicional",
		shortLabel: "YM",
		tone: "blue",
		minPrice: "$ 2.150",
		supermarket: "Carrefour",
		range: "$ 2.150 - $ 2.599",
		updatedAt: "Último registro disponible",
		action: "Agregar",
	},
	{
		product: "Arroz largo fino 1kg",
		brand: "Gallo Oro",
		shortLabel: "AR",
		tone: "orange",
		minPrice: "$ 1.699",
		supermarket: "Vea",
		range: "$ 1.699 - $ 2.299",
		updatedAt: "Último registro disponible",
		action: "Agregar",
	},
	{
		product: "Aceite girasol 1,5L",
		brand: "Natura",
		shortLabel: "AC",
		tone: "yellow",
		minPrice: "$ 2.849",
		supermarket: "Vea",
		range: "$ 2.849 - $ 3.599",
		updatedAt: "Último registro disponible",
		action: "Agregar",
	},
] as const;

export const MARKET_PULSE_ITEMS = [
	{
		title: "Yerba con registro reciente",
		description: "Referencia guardada con fecha visible para comparar.",
		value: "Registro",
		tone: "green",
		points: "4,14 16,20 28,12 40,28 52,18 64,34 76,38",
	},
	{
		title: "Aceite con diferencias registradas",
		description: "Rango observado entre supermercados con datos disponibles.",
		value: "Rango",
		tone: "amber",
		points: "4,12 16,24 28,18 40,32 52,20 64,28 76,16",
	},
	{
		title: "Leche con cobertura completa",
		description: "Comparación por EAN entre fuentes configuradas.",
		value: "Cobertura",
		tone: "green",
		points: "4,28 16,22 28,26 40,18 52,24 64,20 76,24",
	},
] as const;

export function getApprovedHomeCopy() {
	return [
		...HOME_HEADER_NAV.map((item) => item.label),
		HOME_HERO.heading,
		HOME_HERO.body,
		HOME_HERO.searchPlaceholder,
		...HOME_HERO.quickSearches,
		...HOME_HERO.signals,
		SMART_BASKET.title,
		SMART_BASKET.summary,
		...SMART_BASKET.products.flatMap((item) => [item.name, item.brand]),
		...SMART_BASKET.ranking.flatMap((item) => [
			item.supermarket,
			item.total,
			item.coverage,
			item.status,
			item.badge ?? "",
		]),
		"Precios por producto",
		"Mostrando 4 de 4 productos",
		"Ver todos los productos",
		...HOME_PRODUCT_ROWS.flatMap((item) => [
			item.product,
			item.brand,
			item.minPrice,
			item.supermarket,
			item.range,
			item.updatedAt,
			item.action,
		]),
		"Lecturas del catálogo",
		"Ver más",
		...MARKET_PULSE_ITEMS.flatMap((item) => [
			item.title,
			item.description,
			item.value,
		]),
	].filter(Boolean);
}
