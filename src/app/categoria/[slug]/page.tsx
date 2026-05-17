import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { getCategoryBySlug, listProducts } from "@/lib/catalog";
import { getSingleParam } from "@/lib/page-params";
import { createMetadata } from "@/lib/seo/metadata";
import { SUPERMARKETS } from "@/lib/supermarkets";

export const revalidate = 21600;

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  return createMetadata({
    title: category ? `${category.name} en supermercados argentinos` : "Categoria",
    description: category
      ? `Explora ${category.name} con filtros por supermercado, precio y ofertas detectadas.`
      : "Explora productos por categoria.",
    path: `/categoria/${slug}`,
  });
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, rawSearchParams] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const supermarket = getSingleParam(rawSearchParams.super);
  const sort = getSingleParam(rawSearchParams.sort) as "discount" | "price-asc" | "price-desc" | "updated" | undefined;
  const maxPrice = getSingleParam(rawSearchParams.maxPrice);
  const offers = getSingleParam(rawSearchParams.offers);
  const result = await listProducts({
    category: category.name,
    supermarket,
    sort,
    offersOnly: offers === "1",
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    limit: 24,
    page: 1,
  });

  return (
    <div className="px-6 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="surface p-8 md:p-10">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Categoria</p>
              <h1 className="mt-2 text-4xl font-semibold text-foreground md:text-6xl">{category.name}</h1>
              <p className="mt-3 max-w-2xl text-lg text-muted-foreground">
                Filtra por supermercado, acota precio maximo y revisa solo items con oferta detectada.
              </p>
            </div>

            <form className="surface-soft grid gap-3 p-4 md:grid-cols-4" action={`/categoria/${category.slug}`}>
              <select name="super" defaultValue={supermarket ?? ""} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                <option value="">Todos los supers</option>
                {SUPERMARKETS.map((item) => (
                  <option key={item.slug} value={item.slug}>{item.name}</option>
                ))}
              </select>
              <select name="sort" defaultValue={sort ?? "discount"} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                <option value="discount">Mayor descuento</option>
                <option value="price-asc">Precio mas bajo</option>
                <option value="price-desc">Precio mas alto</option>
                <option value="updated">Mas reciente</option>
              </select>
              <input
                type="number"
                name="maxPrice"
                min="0"
                step="1"
                defaultValue={maxPrice ?? ""}
                placeholder="Precio maximo"
                className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <label className="flex items-center gap-2 rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
                <input type="checkbox" name="offers" value="1" defaultChecked={offers === "1"} className="size-4" />
                Solo ofertas
              </label>
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground md:col-span-4">Aplicar filtros</button>
            </form>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {result.items.map((product) => (
            <ProductCard key={product.ean} product={product} />
          ))}
        </section>

        {result.items.length === 0 ? (
          <section className="surface-soft p-6 text-sm text-muted-foreground">
            No hay resultados con esos filtros dentro de {category.name}.
          </section>
        ) : null}
      </div>
    </div>
  );
}
