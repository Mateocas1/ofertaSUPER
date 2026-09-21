import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { StaleResultsNotice } from "@/components/stale-results-notice";
import { loadPublicProductList } from "@/lib/catalog";
import { getSingleParam } from "@/lib/page-params";
import { resolveGuardedCatalogPage } from "@/lib/portfolio-catalog";
import { createMetadata, createUnavailableCatalogMetadata } from "@/lib/seo/metadata";
import { SUPERMARKETS } from "@/lib/supermarkets";
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

const loadCategoryPage = cache(async (
  category: string,
  supermarket: CategoryFilters["supermarket"],
  sort: CategoryFilters["sort"],
  maxPrice: CategoryFilters["maxPrice"],
  offers: CategoryFilters["offers"],
) => resolveGuardedCatalogPage({ category }, (projection) => loadPublicProductList(projection, {
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
    supermarket: getSingleParam(params.super),
    sort: getSingleParam(params.sort) as CategoryFilters["sort"],
    maxPrice: getSingleParam(params.maxPrice),
    offers: getSingleParam(params.offers),
  };
}

function CategoryHeader({ category, filters }: { category: Category; filters: CategoryFilters }) {
  return (
    <section className="surface p-8 md:p-10">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Categoria</p>
          <h1 className="mt-2 text-4xl font-semibold text-foreground md:text-6xl">{category.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted-foreground">Filtra por supermercado, acota precio maximo y revisa solo items con oferta detectada.</p>
        </div>
        <form className="surface-soft grid gap-3 p-4 md:grid-cols-4" action={`/categoria/${category.slug}`}>
          <select name="super" defaultValue={filters.supermarket ?? ""} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground"><option value="">Todos los supers</option>{SUPERMARKETS.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select>
          <select name="sort" defaultValue={filters.sort ?? "discount"} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground"><option value="discount">Mayor descuento</option><option value="price-asc">Precio mas bajo</option><option value="price-desc">Precio mas alto</option><option value="updated">Mas reciente</option></select>
          <input type="number" name="maxPrice" min="0" step="1" defaultValue={filters.maxPrice ?? ""} placeholder="Precio maximo" className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          <label className="flex items-center gap-2 rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground"><input type="checkbox" name="offers" value="1" defaultChecked={filters.offers === "1"} className="size-4" />Solo ofertas</label>
          <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground md:col-span-4">Aplicar filtros</button>
        </form>
      </div>
    </section>
  );
}

function CategoryCatalogState({ category, page }: { category: Category; page: CategoryPageData }) {
  if (page.availability === "unavailable") {
    return <section role="alert" className="rounded-[1.5rem] border border-amber-300 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"><p className="font-semibold">El catálogo no está disponible.</p><p className="mt-1">No podemos mostrar productos reales en este momento. Probá de nuevo más tarde.</p></section>;
  }

  const result = page.catalog;
  const allResultsAreStale = result.items.length && result.items.every((product) => product.rankFreshnessStatus !== "fresh");
  return (
    <>
      {allResultsAreStale ? <StaleResultsNotice context="productos de esta categoría" /> : null}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{result.items.map((product) => <ProductCard key={product.ean} product={product} />)}</section>
      {result.items.length === 0 ? <section className="surface-soft p-6 text-sm text-muted-foreground">No hay resultados con esos filtros dentro de {category.name}.</section> : null}
    </>
  );
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const category = staticCategory(slug);
  if (!category) return createMetadata({ title: "Categoria", description: "Explora productos por categoria.", path: `/categoria/${slug}` });

  const filters = filtersFrom(rawSearchParams);
  const page = await loadCategoryPage(category.name, filters.supermarket, filters.sort, filters.maxPrice, filters.offers);
  if (page.availability === "unavailable") return createUnavailableCatalogMetadata();
  return createMetadata({
    title: `${category.name} en supermercados argentinos`,
    description: `Explora ${category.name} con filtros por supermercado, precio y ofertas detectadas.`,
    path: `/categoria/${slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const category = staticCategory(slug);
  if (!category) notFound();

  const filters = filtersFrom(rawSearchParams);
  const page = await loadCategoryPage(category.name, filters.supermarket, filters.sort, filters.maxPrice, filters.offers);

  return (
    <div className="px-6 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <CategoryHeader category={category} filters={filters} />
        <CategoryCatalogState category={category} page={page} />
      </div>
    </div>
  );
}
