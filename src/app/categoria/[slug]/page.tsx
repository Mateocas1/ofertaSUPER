import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { StaleResultsNotice } from "@/components/stale-results-notice";
import { FilterCheckbox, FilterSelect, SupermarketFilter, type FilterOption } from "@/components/search/catalog-filters";
import { CatalogMessage, CatalogUnavailable, ProductGrid } from "@/components/search/catalog-states";
import { FilterForm } from "@/components/search/filter-form";
import { resultCountLabel } from "@/components/search/result-count";
import { getSingleParam } from "@/lib/page-params";
import { loadSnapshotProductList, resolveSnapshotCatalogPage } from "@/lib/public-pages";
import { createMetadata, createUnavailableCatalogMetadata } from "@/lib/seo/metadata";
import { DETAILED_CATEGORIES } from "@/lib/vtex/categories";

export const revalidate = 21600;

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type CategoryFilters = {
  supermarket?: string;
  sort?: "discount" | "price-asc" | "price-desc" | "updated";
  maxPrice?: string;
  offers?: string;
};

// The default order is the catalog ranking: products compared in more
// supermarkets first, then by name.
const SORT_OPTIONS: FilterOption[] = [
  { value: "", label: "Más comparados" },
  { value: "price-asc", label: "Precio más bajo" },
  { value: "price-desc", label: "Precio más alto" },
  { value: "discount", label: "Mayor descuento" },
  { value: "updated", label: "Relevamiento más reciente" },
];

const loadCategoryPage = cache(async (
  category: string,
  supermarket: CategoryFilters["supermarket"],
  sort: CategoryFilters["sort"],
  maxPrice: CategoryFilters["maxPrice"],
  offers: CategoryFilters["offers"],
) => resolveSnapshotCatalogPage({ category }, () => loadSnapshotProductList({
  category,
  supermarket,
  sort,
  offersOnly: offers === "1",
  maxPrice: maxPrice ? Number(maxPrice) : undefined,
  limit: 24,
  page: 1,
})));

type CategoryPageData = Awaited<ReturnType<typeof loadCategoryPage>>;
type Category = NonNullable<ReturnType<typeof staticCategory>>;

function staticCategory(slug: string) {
  return DETAILED_CATEGORIES.find((category) => category.slug === slug) ?? null;
}

function filtersFrom(params: Record<string, string | string[] | undefined>): CategoryFilters {
  return {
    supermarket: getSingleParam(params.super) || undefined,
    sort: (getSingleParam(params.sort) || undefined) as CategoryFilters["sort"],
    maxPrice: getSingleParam(params.maxPrice) || undefined,
    offers: getSingleParam(params.offers) || undefined,
  };
}

function CategoryFiltersForm({ category, filters }: { category: Category; filters: CategoryFilters }) {
  return (
    <FilterForm
      key={`${filters.supermarket ?? ""}|${filters.sort ?? ""}|${filters.offers ?? ""}`}
      action={`/categoria/${category.slug}`}
      label={`Filtrar ${category.name}`}
    >
      {/* A price cap from an older link keeps applying; it has no control of its own. */}
      {filters.maxPrice ? <input type="hidden" name="maxPrice" value={filters.maxPrice} /> : null}
      <SupermarketFilter id="category-supermarket-filter" value={filters.supermarket} />
      <FilterSelect id="category-sort-filter" name="sort" label="Ordenar por" value={filters.sort} options={SORT_OPTIONS} />
      <FilterCheckbox id="category-offers-filter" name="offers" label="Solo con descuento" checked={filters.offers === "1"} />
    </FilterForm>
  );
}

function CategoryResults({ category, page }: { category: Category; page: CategoryPageData }) {
  if (page.availability === "unavailable") {
    return <CatalogUnavailable>No podemos mostrar productos reales en este momento. Probá de nuevo más tarde.</CatalogUnavailable>;
  }

  const result = page.catalog;
  if (result.items.length === 0) {
    return (
      <CatalogMessage title={`No hay productos de ${category.name} con estos filtros.`}>
        <p>Probá con otro supermercado o sacá el filtro de descuento.</p>
      </CatalogMessage>
    );
  }

  const allResultsAreStale = result.items.every((product) => product.rankFreshnessStatus !== "fresh");
  return (
    <>
      {allResultsAreStale ? <StaleResultsNotice context="productos de esta categoría" /> : null}
      <ProductGrid products={result.items} label={`Productos de ${category.name}`} />
    </>
  );
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const category = staticCategory(slug);
  if (!category) return createMetadata({ title: "Categoría", description: "Explorá productos por categoría.", path: `/categoria/${slug}` });

  const filters = filtersFrom(rawSearchParams);
  const page = await loadCategoryPage(category.name, filters.supermarket, filters.sort, filters.maxPrice, filters.offers);
  if (page.availability === "unavailable") return createUnavailableCatalogMetadata();
  return createMetadata({
    title: `${category.name} en supermercados argentinos`,
    description: `Precios de ${category.name} comparados entre supermercados argentinos, con filtros por supermercado y descuento.`,
    path: `/categoria/${slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const category = staticCategory(slug);
  if (!category) notFound();

  const filters = filtersFrom(rawSearchParams);
  const page = await loadCategoryPage(category.name, filters.supermarket, filters.sort, filters.maxPrice, filters.offers);
  const result = page.availability === "eligible" ? page.catalog : null;

  return (
    <div className="container-page flex flex-col gap-5 py-6 md:py-8">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{category.name}</h1>
          {result ? <p className="mt-1 text-sm text-muted-foreground">{resultCountLabel(result.total, result.items.length)}</p> : null}
        </div>
        {result ? <CategoryFiltersForm category={category} filters={filters} /> : null}
      </header>
      <CategoryResults category={category} page={page} />
    </div>
  );
}
