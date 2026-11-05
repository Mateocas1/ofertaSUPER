import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import type { ReactNode } from "react";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { ThumbFrame } from "@/components/product-card/thumb-frame";
import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import { formatCurrency, formatDiscountPercent } from "@/lib/format";
import { type PriceFreshnessStatus } from "@/lib/price-freshness";
import {
  cardCoverageLabel,
  cardVerdictLabel,
  isSavingsVerdict,
  formatObservedDay,
  promotionLabel,
  summarizeCardOffers,
  type CardOfferRow,
  type CardOfferSummary,
} from "@/lib/product-card-offers";
import { detectAutomaticDiscount } from "@/lib/promotions/detect";
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
  isAvailable?: boolean;
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

// The image is decorative (the linked name sits next to it), so it has an
// empty alt and a calm placeholder underneath for missing or broken images.
function ProductThumb({ product, href }: { product: ProductCardProduct; href: string }) {
  return (
    <Link href={href} tabIndex={-1} aria-hidden="true" className="shrink-0">
      <ThumbFrame className="relative size-16 overflow-hidden rounded-lg bg-muted">
        <Package className="absolute inset-0 m-auto size-6 text-muted-foreground/50" aria-hidden="true" />
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt="" fill sizes="64px" className="img-outline object-contain" unoptimized />
        ) : null}
      </ThumbFrame>
    </Link>
  );
}

function HeadlinePrice({ price, entry }: { price: number | null; entry: ProductCardEntry | undefined }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <p className="price text-2xl text-foreground">{price === null ? "Sin precio" : formatCurrency(price)}</p>
      {entry ? <StruckListPrice price={entry.price} listPrice={entry.listPrice} /> : null}
      {entry?.promo ? (
        <PromotionBadge type={entry.promo.type === "nth-unit" ? "2nd_50" : "percentage"} label={promotionLabel(entry.promo)} />
      ) : null}
    </div>
  );
}

function RowDifference({ row }: { row: CardOfferRow<ProductCardEntry> }) {
  if (row.olderCheaper) return <span className="text-xs text-muted-foreground">dato anterior</span>;
  return <span className="text-xs tabular-nums text-muted-foreground">+{formatCurrency(row.difference)}</span>;
}

function RowDeal({ entry }: { entry: ProductCardEntry }) {
  const discount = detectAutomaticDiscount(entry.price, entry.listPrice);
  const label = entry.promo ? promotionLabel(entry.promo) : discount ? formatDiscountPercent(discount.percentOff) : null;
  return label ? <span className="truncate text-xs font-medium tabular-nums text-deal-ink">{label}</span> : null;
}

function OfferRow({ entry, children }: { entry: ProductCardEntry; children: ReactNode }) {
  return (
    <li data-supermarket={entry.supermarket.slug} className="flex items-baseline gap-2 py-0.5 text-sm">
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{entry.supermarket.name}</span>
      <RowDeal entry={entry} />
      <span className="tabular-nums text-foreground">{formatCurrency(entry.price)}</span>
      <span className="w-14 shrink-0 text-right">{children}</span>
    </li>
  );
}

function OfferRows({ product, summary }: { product: ProductCardProduct; summary: CardOfferSummary<ProductCardEntry> }) {
  if (summary.unnamedCheapest.length === 0 && summary.others.length === 0) return null;
  return (
    <ul aria-label={`Precios por supermercado: ${product.name}`} className="divide-y divide-border border-t border-border">
      {summary.unnamedCheapest.map((entry) => (
        <OfferRow key={entry.supermarket.slug} entry={entry}><span className="text-xs text-muted-foreground">igual</span></OfferRow>
      ))}
      {summary.others.map((row) => (
        <OfferRow key={row.entry.supermarket.slug} entry={row.entry}><RowDifference row={row} /></OfferRow>
      ))}
    </ul>
  );
}

// Observation date and coverage, never a live-price claim: a stale headline
// says so in words, in the warning tone.
function ObservationLine({ product, coverage }: { product: ProductCardProduct; coverage: number }) {
  const checkedAt = product.displayPriceCheckedAt ?? product.bestPriceCheckedAt;
  const stale = (product.displayPriceFreshnessStatus ?? product.bestPriceFreshnessStatus) === "stale";
  const day = checkedAt ? formatObservedDay(checkedAt) : null;
  const parts = [
    stale ? "Dato viejo" : null,
    day ? `${stale ? "relevado" : "Relevado"} el ${day}` : null,
    cardCoverageLabel(coverage),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className={cn("text-xs", stale ? "font-medium text-warning" : "text-muted-foreground")}>{parts.join(" · ")}</p>;
}

export function ProductCard({ product }: ProductCardProps) {
  const href = `/producto/${product.ean}`;
  const headline = product.displayPrice ?? product.minPrice;
  const summary = summarizeCardOffers(product.entries, headline);
  const verdict = cardVerdictLabel(summary.verdict);

  return (
    <article className="surface flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <ProductThumb product={product} href={href} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
            <Link href={href} className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              {product.name}
            </Link>
          </h3>
          {product.brand ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{product.brand}</p> : null}
        </div>
        <FavoriteButton ean={product.ean} productName={product.name} size="sm" className="-mr-1 -mt-1" />
      </div>

      <div className="space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <HeadlinePrice price={headline} entry={summary.cheapest[0]} />
          <BasketControls ean={product.ean} productName={product.name} compact className="shrink-0" />
        </div>
        {verdict ? (
          <p className={cn("text-sm font-medium", isSavingsVerdict(summary.verdict) ? "text-primary" : "text-foreground")}>{verdict}</p>
        ) : null}
        <ObservationLine product={product} coverage={summary.coverage} />
      </div>

      <OfferRows product={product} summary={summary} />
    </article>
  );
}
