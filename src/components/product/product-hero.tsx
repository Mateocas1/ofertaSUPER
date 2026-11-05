import Link from "next/link";
import { TrendingDown } from "lucide-react";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import type { PriceComparisonEntry } from "@/components/price-comparison";
import { ProductThumb } from "@/components/product-thumb";
import {
  cheapestCopy,
  hasCheaperOlderPrice,
  displayBrand,
  dropHeadline,
  hasComparablePrice,
  headlineDropEntry,
  observationCopy,
  promoBadgeType,
  promoLabel,
} from "@/components/product/product-price-model";
import { formatCurrency } from "@/lib/format";
import type { PriceFreshnessStatus } from "@/lib/price-freshness";
import { slugify } from "@/lib/slugify";
import { cn } from "@/lib/utils";

export type ProductHeroProduct = {
  ean: string;
  name: string;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  displayPrice: number | null;
  displayPriceCheckedAt: string | null;
  displayPriceFreshnessStatus: PriceFreshnessStatus;
  bestFinalPrice: number | null;
};

type ProductHeroProps = {
  product: ProductHeroProduct;
  entries: PriceComparisonEntry[];
  cheapest: PriceComparisonEntry[];
};

function ProductTitle({ product }: { product: ProductHeroProduct }) {
  return (
    <div className="flex flex-col gap-1">
      {product.category ? (
        <Link
          href={`/categoria/${slugify(product.category)}`}
          className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {product.category}
        </Link>
      ) : null}
      <h1 className="text-2xl font-semibold text-balance text-foreground md:text-3xl">{product.name}</h1>
      <p className="text-sm text-muted-foreground">
        {product.brand ? <>{displayBrand(product.brand)} · </> : null}EAN <span className="tabular-nums">{product.ean}</span>
      </p>
    </div>
  );
}

function PromoPriceLine({ product }: { product: ProductHeroProduct }) {
  const { bestFinalPrice, displayPrice } = product;
  if (bestFinalPrice === null || displayPrice === null || bestFinalPrice >= displayPrice) return null;
  return (
    <p className="text-sm text-foreground">
      Con promo, estimado: <span className="price font-semibold">{formatCurrency(bestFinalPrice)}</span>
    </p>
  );
}

function PriceLines({ product, entries, cheapest }: ProductHeroProps) {
  const headlineEntry = cheapest[0];
  const comparableCount = entries.filter(hasComparablePrice).length;
  const cheapestText = cheapestCopy(cheapest, comparableCount, hasCheaperOlderPrice(entries, product.displayPrice));
  const promo = cheapest.find((entry) => entry.promo !== null)?.promo ?? null;
  const dropEntry = headlineDropEntry(cheapest);
  const drop = dropEntry ? dropHeadline(dropEntry) : null;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="price text-4xl font-semibold text-foreground">{formatCurrency(product.displayPrice)}</p>
        {headlineEntry ? <StruckListPrice price={headlineEntry.price} listPrice={headlineEntry.listPrice} /> : null}
        {promo ? <PromotionBadge type={promoBadgeType(promo)} label={promoLabel(promo)} /> : null}
      </div>
      {cheapestText ? (
        <p className={cn("text-sm font-medium", cheapestText.isCheapest ? "text-primary" : "text-foreground")}>{cheapestText.text}</p>
      ) : null}
      <PromoPriceLine product={product} />
      {drop ? (
        <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
          <TrendingDown className="size-4" aria-hidden="true" />
          <span className="price">{drop}</span>
        </p>
      ) : null}
    </>
  );
}

function PriceBlock(props: ProductHeroProps) {
  const { product } = props;
  const observation = observationCopy(product.displayPriceCheckedAt, product.displayPriceFreshnessStatus);

  if (product.displayPrice === null) {
    return (
      <div className="surface flex max-w-xl flex-col gap-1 p-4 md:p-5">
        <p className="text-lg font-semibold text-foreground">Sin precio disponible</p>
        <p className="text-sm text-muted-foreground">Ningún supermercado tenía stock en el último relevamiento.</p>
      </div>
    );
  }

  return (
    <div className="surface flex max-w-xl flex-col gap-2 p-4 md:p-5">
      <PriceLines {...props} />
      <p className={cn("text-xs", observation.stale ? "font-medium text-warning" : "text-muted-foreground")}>{observation.text}</p>
    </div>
  );
}

export function ProductHero(props: ProductHeroProps) {
  const { product } = props;
  return (
    <section className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <ProductThumb src={product.imageUrl} alt={product.name} size="hero" priority className="mx-auto max-w-56 rounded-xl md:max-w-none" />
      <div className="flex min-w-0 flex-col gap-5">
        <ProductTitle product={product} />
        <PriceBlock {...props} />
        <div className="flex flex-wrap items-center gap-2">
          <BasketControls ean={product.ean} productName={product.name} />
          <FavoriteButton ean={product.ean} productName={product.name} showLabel />
        </div>
        {product.description ? <p className="max-w-prose text-sm text-muted-foreground">{product.description}</p> : null}
      </div>
    </section>
  );
}
