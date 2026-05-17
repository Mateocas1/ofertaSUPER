import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { LazyPriceChart } from "@/components/lazy-price-chart";
import { PriceComparison } from "@/components/price-comparison";
import { PromotionBadge } from "@/components/promotion-badge";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { getProductDetail, getProductHistory } from "@/lib/catalog";
import { formatCurrency, formatPercent } from "@/lib/format";
import { createMetadata } from "@/lib/seo/metadata";
import { buildProductPageSchema, serializeJsonLd } from "@/lib/seo/schema";
import { cn } from "@/lib/utils";

export const revalidate = 21600;

type ProductPageProps = {
  params: Promise<{ ean: string }>;
};

function summarizeDescription(description: string | null) {
  if (!description) {
    return "Producto disponible en comparativa multi-super.";
  }

  const firstSentence = description.split(/[.!?]/)[0]?.trim() ?? description.trim();
  if (firstSentence.length <= 220) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, 217).trimEnd()}…`;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { ean } = await params;
  const product = await getProductDetail(ean);

  if (!product) {
    return createMetadata({
      title: "Producto no encontrado",
      description: "El producto solicitado no existe en el catalogo actual.",
      path: `/producto/${ean}`,
    });
  }

  return createMetadata({
    title: `${product.name} desde ${formatCurrency(product.minPrice)}`,
    description: `Compara ${product.name} en supermercados argentinos y revisa su historial de precio reciente.`,
    path: `/producto/${ean}`,
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { ean } = await params;
  const [product, history] = await Promise.all([getProductDetail(ean), getProductHistory(ean, 90)]);

  if (!product) {
    notFound();
  }

  const hasCalculatedPromoPrice =
    product.bestFinalPrice !== null && product.minPrice !== null && product.bestFinalPrice < product.minPrice;
  const bestPriceDropAlert = product.bestPriceDropAlert;
  const structuredData = buildProductPageSchema(product);

  return (
    <div className="px-6 py-8 md:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="surface p-8 md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                {product.category ? (
                  <Link href={`/categoria/${product.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`} className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-sm text-muted-foreground">
                    {product.category}
                  </Link>
                ) : null}
                <span className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-sm text-muted-foreground">EAN {product.ean}</span>
              </div>

              <div>
                <h1 className="max-w-4xl text-4xl font-semibold leading-none text-balance text-foreground md:text-6xl">
                  {product.name}
                </h1>
                <p className="mt-3 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {product.brand ?? "Sin marca informada"}
                </p>
                <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
                  {summarizeDescription(product.description)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <FavoriteButton ean={product.ean} productName={product.name} showLabel />
                <BasketControls ean={product.ean} productName={product.name} />
                <Link href="/canasta" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}>
                  Ver canasta
                </Link>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[1.5rem] border border-border/70 bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Mejor precio</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(product.minPrice)}</p>
                  {bestPriceDropAlert ? (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      Bajo {formatPercent(-bestPriceDropAlert.percentDrop)} vs ultimo registro
                    </p>
                  ) : null}
                </article>
                <article className="rounded-[1.5rem] border border-border/70 bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Precio final con promo</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">
                    {hasCalculatedPromoPrice ? formatCurrency(product.bestFinalPrice) : "No calculable"}
                  </p>
                </article>
                <article className="rounded-[1.5rem] border border-border/70 bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Maximo actual</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{formatCurrency(product.maxPrice)}</p>
                </article>
                <article className="rounded-[1.5rem] border border-border/70 bg-white/75 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Cobertura</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{product.priceEntries.length} supers</p>
                </article>
              </div>
            </div>

            <aside className="surface-soft p-6">
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Disponible en</p>
              <div className="mt-4 flex flex-wrap gap-3">
                {product.priceEntries.map((entry) => (
                  <SupermarketBadge
                    key={entry.supermarket.slug}
                    name={entry.supermarket.name}
                    slug={entry.supermarket.slug}
                    logoUrl={entry.supermarket.logoUrl}
                    price={formatCurrency(entry.price)}
                  />
                ))}
              </div>

              <div className="mt-6 border-t border-border/60 pt-6">
                <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Promociones sobre el producto</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {product.automaticDiscountPercent ? (
                    <PromotionBadge
                      type="percentage"
                      label={`${formatPercent(product.automaticDiscountPercent, 0)} OFF detectado`}
                    />
                  ) : null}
                  {product.promotions.map((promotion) => (
                    <PromotionBadge
                      key={promotion.id}
                      type={promotion.type}
                      label={promotion.title}
                      className="normal-case tracking-normal"
                    />
                  ))}
                  {product.promotions.length === 0 && !product.automaticDiscountPercent ? (
                    <p className="text-sm text-muted-foreground">No hay promociones activas aplicables a este producto.</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-6">
                <Link href="/ofertas" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}>Ver hub de ofertas</Link>
              </div>
            </aside>
          </div>
        </section>

        <PriceComparison entries={product.priceEntries} />
        <LazyPriceChart data={history} />
      </div>
    </div>
  );
}
