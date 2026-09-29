import Image from "next/image";
import Link from "next/link";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getPriceFreshnessCopy, type PriceFreshnessStatus } from "@/lib/price-freshness";
import type { SimplePromotion } from "@/lib/promotions/simple-promos";
import { cn } from "@/lib/utils";

type ProductCardEntry = {
  supermarket: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  price: number | null;
  listPrice: number | null;
  promo: SimplePromotion | null;
};

type ProductCardProduct = {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  displayPrice?: number | null;
  displayPriceCheckedAt?: string | null;
  displayPriceFreshnessStatus?: PriceFreshnessStatus;
  priceCount: number;
  automaticDiscountPercent: number | null;
  bestPriceCheckedAt: string | null;
  bestPriceFreshnessStatus: PriceFreshnessStatus;
  entries: ProductCardEntry[];
};

type ProductCardProps = {
  product: ProductCardProduct;
};

function ProductCardBadges({ product }: { product: ProductCardProduct }) {
  return (
    <div className="flex flex-wrap gap-2">
      {product.category ? (
        <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {product.category}
        </span>
      ) : null}
      {product.automaticDiscountPercent ? (
        <PromotionBadge type="percentage" label={`${formatPercent(product.automaticDiscountPercent, 0)} OFF`} />
      ) : null}
    </div>
  );
}

function ProductCardImage({ product }: { product: ProductCardProduct }) {
  return (
    <div className="relative size-18 overflow-hidden rounded-xl bg-surface-3/70 md:size-24">
      {product.imageUrl ? (
        <Image src={product.imageUrl} alt={product.name} fill sizes="96px" className="object-cover" unoptimized />
      ) : (
        <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Sin foto
        </div>
      )}
    </div>
  );
}

// The struck list price belongs to the entry that set the displayed price.
function displayStrikeEntry(entries: ProductCardEntry[], displayPrice: number | null) {
  return entries.find((entry) => entry.price === displayPrice) ?? null;
}

function ProductCardPricePanel({ product, displayPrice, isStale, freshnessCopy }: { product: ProductCardProduct; displayPrice: number | null; isStale: boolean; freshnessCopy: ReturnType<typeof getPriceFreshnessCopy> }) {
  const displayEntry = displayStrikeEntry(product.entries, displayPrice);
  return (
    <div className="mt-6 flex items-end justify-between gap-4 rounded-xl border-2 border-dashed border-border bg-surface-1 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{freshnessCopy.priceLabel}</p>
        <p className="price mt-1 text-3xl text-primary">{formatCurrency(displayPrice)}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <StruckListPrice price={displayEntry?.price ?? null} listPrice={displayEntry?.listPrice ?? null} />
          {displayEntry?.promo ? <PromotionBadge type={displayEntry.promo.type === "nth-unit" ? "2nd_50" : "percentage"} label={displayEntry.promo.label} /> : null}
        </div>
        {isStale ? <p className="mt-1 text-xs font-medium text-warning">{freshnessCopy.badgeLabel}</p> : null}
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rango</p>
        <p className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">
          {formatCurrency(displayPrice)} - {formatCurrency(product.maxPrice)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{product.priceCount} supers con precio</p>
      </div>
    </div>
  );
}

export function ProductCard({ product }: ProductCardProps) {
  const topEntries = product.entries.slice(0, 3);
  const displayPrice = product.displayPrice ?? product.minPrice;
  const displayPriceCheckedAt = product.displayPriceCheckedAt ?? product.bestPriceCheckedAt;
  const displayPriceFreshnessStatus = product.displayPriceFreshnessStatus ?? product.bestPriceFreshnessStatus;
  const freshnessCopy = getPriceFreshnessCopy({
    status: displayPriceFreshnessStatus,
    checkedAt: displayPriceCheckedAt,
    ageHours: null,
    maxAgeHours: 0,
  });
  const isStale = displayPriceFreshnessStatus === "stale";

  return (
    <article className="surface lift flex h-full flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <ProductCardBadges product={product} />

          <div>
            <h3 className="font-display text-xl font-bold leading-tight text-balance text-foreground">{product.name}</h3>
            {product.brand ? <p className="mt-1 text-sm text-muted-foreground">{product.brand}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <FavoriteButton ean={product.ean} productName={product.name} size="sm" />
          <ProductCardImage product={product} />
        </div>
      </div>

      <ProductCardPricePanel product={product} displayPrice={displayPrice} isStale={isStale} freshnessCopy={freshnessCopy} />

      <div className="mt-4 flex flex-wrap gap-2">
        {topEntries.map((entry) => (
          <SupermarketBadge
            key={`${product.ean}-${entry.supermarket.slug}`}
            name={entry.supermarket.name}
            slug={entry.supermarket.slug}
            logoUrl={entry.supermarket.logoUrl}
            price={formatCurrency(entry.price)}
          />
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">EAN {product.ean}</span>
          <BasketControls ean={product.ean} productName={product.name} compact />
        </div>
        <Link href={`/producto/${product.ean}`} className={cn(buttonVariants({ size: "sm" }), "press rounded-full px-4")}>
          Ver comparativa
        </Link>
      </div>
    </article>
  );
}
