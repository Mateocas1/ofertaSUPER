import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { SearchBar } from "@/components/search-bar";
import { StaleResultsNotice } from "@/components/stale-results-notice";
import { isCatalogRuntimeAvailable } from "@/lib/catalog-availability";
import { listProducts } from "@/lib/catalog";
import { getDemoProductPage } from "@/lib/demo-data";
import { getSingleParam } from "@/lib/page-params";
import { withFallback } from "@/lib/safe-data";
import { createMetadata } from "@/lib/seo/metadata";
import { SUPERMARKETS } from "@/lib/supermarkets";

export const revalidate = 21600;

type SearchPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = getSingleParam(params.q);

  return createMetadata({
    title: query ? `Buscar ${query}` : "Buscar productos",
    description: query
      ? `Resultados para ${query} con precios comparados en supermercados argentinos.`
      : "Buscador de productos y marcas en supermercados argentinos.",
    path: query ? `/buscar?q=${encodeURIComponent(query)}` : "/buscar",
  });
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = getSingleParam(params.q) ?? "";
  const supermarket = getSingleParam(params.super);
  const sort = getSingleParam(params.sort) as "relevance" | "discount" | "price-asc" | "price-desc" | "updated" | undefined;
  const filters = {
    query,
    supermarket,
    sort,
    limit: 24,
    page: 1,
  };
  const fallbackResult = getDemoProductPage(filters);
  const result = query
    ? (await isCatalogRuntimeAvailable())
      ? await withFallback(listProducts(filters), fallbackResult)
      : fallbackResult
    : { items: [], total: 0 };
  const allResultsAreStale = result.items.length > 0 && result.items.every((product) => product.rankFreshnessStatus !== "fresh");

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

        {query && allResultsAreStale ? <StaleResultsNotice context="resultados" /> : null}

        {query ? (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <h2 className="sr-only">Resultados de búsqueda</h2>
            {result.items.map((product) => (
              <ProductCard key={product.ean} product={product} />
            ))}
          </section>
        ) : (
          <section className="surface-soft p-6 text-sm text-muted-foreground">
            Probá con marcas, categorías o productos concretos. Ejemplos: Coca Cola, yerba, arroz.
          </section>
        )}

        {query && result.items.length === 0 ? (
          <section className="surface-soft p-6 text-sm text-muted-foreground">
            No encontramos coincidencias para esa búsqueda con los filtros actuales.
          </section>
        ) : null}
      </div>
    </div>
  );
}
