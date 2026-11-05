import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { LazyPriceChart } from "@/components/lazy-price-chart";
import { PriceComparison, type PriceComparisonEntry } from "@/components/price-comparison";
import { ProductHero } from "@/components/product/product-hero";
import { cheapestCopy, cheapestEntries, hasComparablePrice } from "@/components/product/product-price-model";
import { createGuardedProductMetadata } from "@/lib/seo/metadata";
import { createGuardedProductPageLoader } from "@/lib/seo/public-catalog-page";
import { buildGuardedProductPageSchema, serializeJsonLd } from "@/lib/seo/schema";
import { previousObservedAtOf } from "@/lib/product-history";
import { loadSnapshotProductPage } from "@/lib/public-pages";

export const revalidate = 21600;

type ProductPageProps = {
  params: Promise<{ ean: string }>;
};

const loadGuardedProductPage = createGuardedProductPageLoader(loadSnapshotProductPage);
type GuardedProductPage = Awaited<ReturnType<typeof loadGuardedProductPage>>;
type EligibleProductPage = Extract<GuardedProductPage, { availability: "eligible" }>;
type Product = NonNullable<EligibleProductPage["catalog"]["product"]>;

// The page metadata keeps the English "Catalog temporarily unavailable" title
// pinned by tests/product-page.test.ts and ARCHITECTURE.md; the visible page is
// in Spanish.
function CatalogUnavailablePage() {
  return (
    <div className="container-page py-8 md:py-10">
      <section className="surface p-4 md:p-5" aria-labelledby="catalog-unavailable-title">
        <h1 id="catalog-unavailable-title" className="text-2xl font-semibold text-foreground">
          Catálogo no disponible por el momento
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground" role="alert">
          No pudimos leer los precios relevados. Probá de nuevo en unos minutos.
        </p>
      </section>
    </div>
  );
}

function ProductSchema({ page }: { page: EligibleProductPage }) {
  const structuredData = buildGuardedProductPageSchema(page);
  return structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} /> : null;
}

// The snapshot loader measures every movement against the last different
// price and adds that observation's date to each entry.
function comparisonEntries(product: Product): PriceComparisonEntry[] {
  return product.priceEntries.map((entry) => ({ ...entry, previousObservedAt: previousObservedAtOf(entry) }));
}

function ProductDetails({ page, product }: { page: EligibleProductPage; product: Product }) {
  const entries = comparisonEntries(product);
  const cheapest = cheapestEntries(entries, product.displayPrice);
  // A row is marked "Más barato" only when something costs more: not for a
  // single offer, nor when every offer ties.
  const markCheapest = cheapestCopy(cheapest, entries.filter(hasComparablePrice).length)?.isCheapest ?? false;

  return (
    <div className="container-page flex flex-col gap-10 py-6 md:gap-14 md:py-10">
      <ProductSchema page={page} />
      <ProductHero product={product} entries={entries} cheapest={cheapest} />
      <PriceComparison
        entries={entries}
        cheapestSlugs={markCheapest ? cheapest.map((entry) => entry.supermarket.slug) : []}
        productName={product.name}
      />
      <LazyPriceChart data={page.catalog.history} />
    </div>
  );
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { ean } = await params;
  const page = await loadGuardedProductPage(ean, 90);

  return createGuardedProductMetadata(page);
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { ean } = await params;
  const page = await loadGuardedProductPage(ean, 90);

  if (page.availability === "unavailable") return <CatalogUnavailablePage />;
  if (!page.catalog.product) notFound();

  return <ProductDetails page={page} product={page.catalog.product} />;
}
