import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { CatalogProvenanceNotice } from "@/components/catalog-provenance-notice";
import { SearchBar } from "@/components/search-bar";
import { FilterSelect, SupermarketFilter, type FilterOption } from "@/components/search/catalog-filters";
import { CatalogMessage, CatalogUnavailable, ProductGrid } from "@/components/search/catalog-states";
import { FilterForm } from "@/components/search/filter-form";
import { resultCountLabel } from "@/components/search/result-count";
import { loadSnapshotProductList, resolveSnapshotCatalogPage } from "@/lib/public-pages";
import { getSingleParam } from "@/lib/page-params";
import { createMetadata, createUnavailableCatalogMetadata } from "@/lib/seo/metadata";

export const revalidate = 21600;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SearchFilters = {
  query: string;
  supermarket?: string;
  sort?: "relevance" | "discount" | "price-asc" | "price-desc" | "updated";
};

const SORT_OPTIONS: FilterOption[] = [
  { value: "", label: "Relevancia" },
  { value: "price-asc", label: "Precio más bajo" },
  { value: "price-desc", label: "Precio más alto" },
  { value: "discount", label: "Mayor descuento" },
  { value: "updated", label: "Relevamiento más reciente" },
];

const EXAMPLE_QUERIES = ["leche", "yerba", "arroz", "aceite", "café"];

const loadSearchPage = cache(async (
  query: string,
  supermarket: SearchFilters["supermarket"],
  sort: SearchFilters["sort"],
) => resolveSnapshotCatalogPage({ query }, () => ({
  products: query
    ? loadSnapshotProductList({ query, supermarket, sort, limit: 24, page: 1 })
    : null,
})));

type SearchPageData = Awaited<ReturnType<typeof loadSearchPage>>;
type SearchResult = NonNullable<Extract<SearchPageData, { availability: "eligible" }>["catalog"]["products"]>;

function filtersFrom(params: Record<string, string | string[] | undefined>): SearchFilters {
  return {
    query: getSingleParam(params.q)?.trim() ?? "",
    supermarket: getSingleParam(params.super) || undefined,
    sort: (getSingleParam(params.sort) || undefined) as SearchFilters["sort"],
  };
}

function SearchHeading({ query, result }: { query: string; result: SearchResult | null }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
        {query ? `Resultados para “${query}”` : "Buscá un producto"}
      </h1>
      {result ? (
        <p className="mt-1 text-sm text-muted-foreground">{resultCountLabel(result.total, result.items.length)}</p>
      ) : null}
    </div>
  );
}

function SearchFiltersForm({ filters }: { filters: SearchFilters }) {
  return (
    <FilterForm key={`${filters.query}|${filters.supermarket ?? ""}|${filters.sort ?? ""}`} action="/buscar" label="Filtrar resultados">
      <input type="hidden" name="q" value={filters.query} />
      <SupermarketFilter id="search-supermarket-filter" value={filters.supermarket} />
      <FilterSelect id="search-sort-filter" name="sort" label="Ordenar por" value={filters.sort} options={SORT_OPTIONS} />
    </FilterForm>
  );
}

function ExampleQueries() {
  return (
    <CatalogMessage title="Escribí un producto o una marca">
      <p>
        Probá con{" "}
        {EXAMPLE_QUERIES.map((example, index) => (
          <span key={example}>
            <Link href={`/buscar?q=${encodeURIComponent(example)}`} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
              {example}
            </Link>
            {index < EXAMPLE_QUERIES.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </CatalogMessage>
  );
}

function NoResults({ filters }: { filters: SearchFilters }) {
  return (
    <CatalogMessage title={`No encontramos productos para “${filters.query}”.`}>
      <p>Revisá la ortografía o probá con una palabra más general.</p>
      {filters.supermarket ? (
        <p className="mt-2">
          <Link href={`/buscar?q=${encodeURIComponent(filters.query)}`} className="font-medium text-foreground underline underline-offset-4 hover:text-primary">
            Buscar en todos los supermercados
          </Link>
        </p>
      ) : null}
    </CatalogMessage>
  );
}

function SearchResults({ filters, page }: { filters: SearchFilters; page: SearchPageData }) {
  if (page.availability === "unavailable") {
    return <CatalogUnavailable>No podemos mostrar resultados reales en este momento. Probá de nuevo más tarde.</CatalogUnavailable>;
  }

  const result = page.catalog.products;
  if (!filters.query || !result) return <ExampleQueries />;
  if (result.items.length === 0) return <NoResults filters={filters} />;

  return (
    <>
      <CatalogProvenanceNotice {...page.catalog} />
      <ProductGrid products={result.items} label="Resultados de búsqueda" />
    </>
  );
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const filters = filtersFrom(await searchParams);
  const page = await loadSearchPage(filters.query, filters.supermarket, filters.sort);
  if (page.availability === "unavailable") return createUnavailableCatalogMetadata();

  return createMetadata({
    title: filters.query ? `Buscar ${filters.query}` : "Buscar productos",
    description: filters.query
      ? `Resultados para ${filters.query} con precios comparados en supermercados argentinos.`
      : "Buscador de productos y marcas en supermercados argentinos.",
    path: filters.query ? `/buscar?q=${encodeURIComponent(filters.query)}` : "/buscar",
  });
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const filters = filtersFrom(await searchParams);
  const page = await loadSearchPage(filters.query, filters.supermarket, filters.sort);
  const result = page.availability === "eligible" ? page.catalog.products : null;

  return (
    <div className="container-page flex flex-col gap-5 py-6 md:py-8">
      <header className="flex flex-col gap-4">
        <SearchHeading query={filters.query} result={result} />
        <SearchBar defaultValue={filters.query} />
        {result && filters.query && (result.total > 0 || filters.supermarket) ? <SearchFiltersForm filters={filters} /> : null}
      </header>
      <SearchResults filters={filters} page={page} />
    </div>
  );
}
