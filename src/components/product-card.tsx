import Image from "next/image";
import Link from "next/link";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { PromotionBadge } from "@/components/promotion-badge";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatCurrency, formatPercent } from "@/lib/format";
import { getPriceFreshnessCopy, type PriceFreshnessStatus } from "@/lib/price-freshness";
import { cn } from "@/lib/utils";

type ProductCardProps = {
  product: {
    ean: string;
    name: string;
    brand: string | null;
    imageUrl: string | null;
    category: string | null;
    minPrice: number | null;
    maxPrice: number | null;
    priceCount: number;
    automaticDiscountPercent: number | null;
    bestPriceCheckedAt: string | null;
    bestPriceFreshnessStatus: PriceFreshnessStatus;
    entries: Array<{
      supermarket: {
        id: number;
        name: string;
        slug: string;
        logoUrl: string | null;
      };
      price: number | null;
    }>;
  };
};

export function ProductCard({ product }: ProductCardProps) {
  const topEntries = product.entries.slice(0, 3);
  const freshnessCopy = getPriceFreshnessCopy({
    status: product.bestPriceFreshnessStatus,
    checkedAt: product.bestPriceCheckedAt,
    ageHours: null,
    maxAgeHours: 0,
  });
  const isStale = product.bestPriceFreshnessStatus === "stale";

  return (
    <article className="surface-soft flex h-full flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {product.category ? (
              <span className="rounded-full border border-border/70 bg-muted/70 px-2.5 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                {product.category}
              </span>
            ) : null}
            {product.automaticDiscountPercent ? (
              <PromotionBadge type="percentage" label={`${formatPercent(product.automaticDiscountPercent, 0)} OFF`} />
            ) : null}
          </div>

          <div>
            <h3 className="text-xl font-semibold leading-tight text-balance text-foreground">{product.name}</h3>
            {product.brand ? <p className="mt-1 text-sm text-muted-foreground">{product.brand}</p> : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <FavoriteButton ean={product.ean} productName={product.name} size="sm" />
          <div className="relative size-18 overflow-hidden rounded-[1.5rem] border border-border/70 bg-muted/40 md:size-24">
            {product.imageUrl ? (
              <Image src={product.imageUrl} alt={product.name} fill sizes="96px" className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Sin foto
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4 rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(210,71,38,0.08),rgba(42,111,88,0.06))] p-4">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{freshnessCopy.priceLabel}</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{formatCurrency(product.minPrice)}</p>
          {isStale ? <p className="mt-1 text-xs font-medium text-amber-700">{freshnessCopy.badgeLabel}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rango</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {formatCurrency(product.minPrice)} - {formatCurrency(product.maxPrice)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{product.priceCount} supers con precio</p>
        </div>
      </div>

      {isStale ? (
        <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          {freshnessCopy.helperText}
        </p>
      ) : null}

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
        <Link href={`/producto/${product.ean}`} className={cn(buttonVariants({ size: "sm" }), "rounded-full px-4")}>
          Ver comparativa
        </Link>
      </div>
    </article>
  );
}
