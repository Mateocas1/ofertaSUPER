import { cache } from "react";
import type { Metadata } from "next";

import { CatalogProvenanceNotice } from "@/components/catalog-provenance-notice";
import { ProductCard } from "@/components/product-card";
import { SearchBar } from "@/components/search-bar";
import { loadPublicProductList } from "@/lib/catalog";
import { getSingleParam } from "@/lib/page-params";
import { resolveGuardedCatalogPage } from "@/lib/portfolio-catalog";
import { createMetadata, createUnavailableCatalogMetadata } from "@/lib/seo/metadata";
import { SUPERMARKETS } from "@/lib/supermarkets";

export const revalidate = 21600;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SearchFilters = {
  query: string;
  supermarket?: string;
  sort?: "relevance" | "discount" | "price-asc" | "price-desc" | "updated";
};

const loadSearchPage = cache(async (
  query: string,
  supermarket: SearchFilters["supermarket"],
  sort: SearchFilters["sort"],
) => resolveGuardedCatalogPage({ query }, async (projection) => ({
  products: query
    ? await loadPublicProductList(projection, { query, supermarket, sort, limit: 24, page: 1 })
    : null,
})));

function filtersFrom(params: Record<string, string | string[] | undefined>): SearchFilters {
  return {
    query: getSingleParam(params.q) ?? "",
    supermarket: getSingleParam(params.super),
    sort: getSingleParam(params.sort) as SearchFilters["sort"],
  };
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
  const { query, supermarket, sort } = filters;

  return (
    <div className="px-6 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="surface p-8 md:p-10">
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Búsqueda</p>
              <h1 className="mt-2 text-4xl font-semibold text-foreground md:text-6xl">
                {query ? `Resultados para "${query}"` : "Encontrá el producto exacto"}
              </h1>
              <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                Buscá productos, compará coincidencias por supermercado y afiná los filtros sin perder contexto.
              </p>
            </div>

            <SearchBar defaultValue={query} />

            <form className="surface-soft grid gap-3 p-4 md:grid-cols-3" action="/buscar">
              <input type="hidden" name="q" value={query} />
              <label className="sr-only" htmlFor="search-supermarket-filter">Supermercado</label>
              <select id="search-supermarket-filter" name="super" defaultValue={supermarket ?? ""} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                <option value="">Todos los supers</option>
                {SUPERMARKETS.map((item) => (
                  <option key={item.slug} value={item.slug}>{item.name}</option>
                ))}
              </select>
              <label className="sr-only" htmlFor="search-sort-filter">Ordenar resultados</label>
              <select id="search-sort-filter" name="sort" defaultValue={sort ?? "relevance"} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                <option value="relevance">Relevancia</option>
                <option value="discount">Mayor descuento</option>
                <option value="price-asc">Precio más bajo</option>
                <option value="price-desc">Precio más alto</option>
                <option value="updated">Más reciente</option>
              </select>
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Refinar</button>
            </form>
          </div>
        </section>

        {page.availability === "eligible" && result ? <CatalogProvenanceNotice {...page.catalog} /> : null}
        {page.availability === "unavailable" ? (
          <section role="alert" className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            <p className="font-semibold">El catálogo no está disponible.</p>
            <p className="mt-1">No podemos mostrar resultados reales en este momento. Probá de nuevo más tarde.</p>
          </section>
        ) : null}

        {query && result ? (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <h2 className="sr-only">Resultados de búsqueda</h2>
            {result.items.map((product) => (
              <ProductCard key={product.ean} product={product} />
            ))}
          </section>
        ) : page.availability === "eligible" ? (
          <section className="surface-soft p-6 text-sm text-muted-foreground">
            Probá con marcas, categorías o productos concretos. Ejemplos: Coca Cola, yerba, arroz.
          </section>
        ) : null}

        {query && result && result.items.length === 0 ? (
          <section className="surface-soft p-6 text-sm text-muted-foreground">
            No encontramos coincidencias para esa búsqueda con los filtros actuales.
          </section>
        ) : null}
      </div>
    </div>
  );
}
