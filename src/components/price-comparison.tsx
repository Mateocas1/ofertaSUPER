import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  hasComparablePrice,
  movementOf,
  previousPriceCopy,
  promoBadgeType,
  promoLabel,
  promoPriceOf,
  sortByPrice,
} from "@/components/product/product-price-model";
import { formatCurrency, formatDate, formatSignedPercent, pluralize } from "@/lib/format";
import type { PriceFreshnessStatus } from "@/lib/price-freshness";
import { PREVIOUS_PRICE_WINDOW_DAYS } from "@/lib/price-movement";
import type { SimplePromotion } from "@/lib/promotions/simple-promos";
import { cn } from "@/lib/utils";

export type PriceComparisonEntry = {
  supermarket: { name: string; slug: string };
  price: number | null;
  listPrice: number | null;
  promo: SimplePromotion | null;
  isAvailable: boolean;
  previousPrice: number | null;
  previousObservedAt: string | null;
  deltaPercent: number | null;
  finalPrice: number | null;
  productUrl: string | null;
  lastCheckedAt: string;
  freshnessStatus: PriceFreshnessStatus;
};

type PriceComparisonProps = {
  entries: PriceComparisonEntry[];
  /** Supermarkets at the headline price, marked "Más barato" in words. */
  cheapestSlugs: readonly string[];
  productName: string;
};

type RowProps = { entry: PriceComparisonEntry; cheapest: boolean; productName: string };

function PriceCell({ entry }: { entry: PriceComparisonEntry }) {
  if (!hasComparablePrice(entry)) {
    return <span className="text-sm text-muted-foreground">{entry.isAvailable ? "Sin precio" : "Sin stock"}</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="price text-base font-semibold text-foreground">{formatCurrency(entry.price)}</span>
      <StruckListPrice price={entry.price} listPrice={entry.listPrice} />
    </span>
  );
}

function PromoCell({ entry }: { entry: PriceComparisonEntry }) {
  if (!entry.promo) return <span className="text-muted-foreground">—</span>;
  return <PromotionBadge type={promoBadgeType(entry.promo)} label={promoLabel(entry.promo)} />;
}

function PromoPriceCell({ entry }: { entry: PriceComparisonEntry }) {
  const promoPrice = promoPriceOf(entry);
  if (promoPrice === null) return <span className="text-muted-foreground">—</span>;
  return <span className="price font-semibold text-foreground">{formatCurrency(promoPrice)}</span>;
}

const MOVEMENT_STYLES = {
  up: "text-destructive",
  down: "text-primary",
  flat: "text-muted-foreground",
} as const;

function MovementCell({ entry }: { entry: PriceComparisonEntry }) {
  const movement = movementOf(entry.deltaPercent);
  const previous = previousPriceCopy(entry);
  if (movement === null || previous === null) {
    return <span className="text-sm text-muted-foreground">Sin cambios en {PREVIOUS_PRICE_WINDOW_DAYS} días</span>;
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className={cn("price text-sm font-medium", MOVEMENT_STYLES[movement])}>
        {movement === "up" ? "Subió" : "Bajó"} {formatSignedPercent(entry.deltaPercent)}
      </span>
      <span className="text-xs text-muted-foreground">desde <span className="price">{previous}</span></span>
    </span>
  );
}

function ObservedCell({ entry }: { entry: PriceComparisonEntry }) {
  return (
    <span className="flex flex-col items-start gap-0.5 text-sm text-muted-foreground">
      <time dateTime={entry.lastCheckedAt}>{formatDate(entry.lastCheckedAt)}</time>
      {entry.freshnessStatus === "stale" ? <span className="text-xs font-medium text-warning">Dato viejo</span> : null}
    </span>
  );
}

function StoreLink({ entry, productName, className }: { entry: PriceComparisonEntry; productName: string; className?: string }) {
  if (!entry.productUrl) return null;
  return (
    <a
      href={entry.productUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Ver ${productName} en ${entry.supermarket.name} (se abre en una pestaña nueva)`}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
    >
      Ver en {entry.supermarket.name}
      <ExternalLink aria-hidden="true" />
    </a>
  );
}

function SupermarketCell({ entry, cheapest }: { entry: PriceComparisonEntry; cheapest: boolean }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="font-medium text-foreground">{entry.supermarket.name}</span>
      {cheapest ? <span className="text-xs font-medium text-primary">Más barato</span> : null}
    </span>
  );
}

function DesktopRow({ entry, cheapest, productName, showPromoPrice }: RowProps & { showPromoPrice: boolean }) {
  return (
    <tr className={cn("border-t border-border align-top", cheapest && "bg-accent/40")}>
      <th scope="row" className="px-4 py-3 text-left font-normal md:px-5"><SupermarketCell entry={entry} cheapest={cheapest} /></th>
      <td className="px-4 py-3"><PriceCell entry={entry} /></td>
      <td className="px-4 py-3"><PromoCell entry={entry} /></td>
      {showPromoPrice ? <td className="px-4 py-3"><PromoPriceCell entry={entry} /></td> : null}
      <td className="px-4 py-3"><MovementCell entry={entry} /></td>
      <td className="px-4 py-3"><ObservedCell entry={entry} /></td>
      <td className="px-4 py-2 text-right md:px-5"><StoreLink entry={entry} productName={productName} /></td>
    </tr>
  );
}

function ComparisonTable({ rows, productName, showPromoPrice }: { rows: RowProps[]; productName: string; showPromoPrice: boolean }) {
  const header = "px-4 py-2 text-left text-xs font-medium text-muted-foreground";
  return (
    <table className="hidden w-full text-sm md:table">
      <caption className="sr-only">Precios de {productName} por supermercado, de menor a mayor</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(header, "md:px-5")}>Supermercado</th>
          <th scope="col" className={header}>Precio</th>
          <th scope="col" className={header}>Promo</th>
          {showPromoPrice ? <th scope="col" className={header}>Precio con promo</th> : null}
          <th scope="col" className={header}>Variación</th>
          <th scope="col" className={header}>Relevado</th>
          <th scope="col" className={cn(header, "md:px-5")}><span className="sr-only">Enlace a la web del supermercado</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => <DesktopRow key={row.entry.supermarket.slug} {...row} showPromoPrice={showPromoPrice} />)}
      </tbody>
    </table>
  );
}

function MobileRow({ entry, cheapest, productName, showPromoPrice }: RowProps & { showPromoPrice: boolean }) {
  const promoPrice = showPromoPrice ? promoPriceOf(entry) : null;
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-4", cheapest && "bg-accent/40")}>
      <div className="flex items-start justify-between gap-3">
        <SupermarketCell entry={entry} cheapest={cheapest} />
        <span className="flex flex-col items-end gap-0.5 text-right"><PriceCell entry={entry} /></span>
      </div>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-2 text-sm">
        {entry.promo ? <PromoCell entry={entry} /> : null}
        {promoPrice !== null ? <span>Con promo <span className="price font-semibold">{formatCurrency(promoPrice)}</span></span> : null}
        <MovementCell entry={entry} />
        <span className="flex gap-1 text-muted-foreground">Relevado <ObservedCell entry={entry} /></span>
      </div>
      <StoreLink entry={entry} productName={productName} className="w-full" />
    </li>
  );
}

export function PriceComparison({ entries, cheapestSlugs, productName }: PriceComparisonProps) {
  if (entries.length === 0) {
    return (
      <section className="surface p-4 text-sm text-muted-foreground md:p-5" aria-labelledby="precios-titulo">
        <h2 id="precios-titulo" className="text-lg font-semibold text-foreground">Precios por supermercado</h2>
        <p className="mt-1">Todavía no relevamos precios de este producto.</p>
      </section>
    );
  }

  const cheapest = new Set(cheapestSlugs);
  const rows = sortByPrice(entries).map((entry) => ({ entry, cheapest: cheapest.has(entry.supermarket.slug), productName }));
  const showPromoPrice = entries.some((entry) => promoPriceOf(entry) !== null);

  return (
    <section id="precios" className="surface overflow-hidden" aria-labelledby="precios-titulo">
      <div className="px-4 pt-4 pb-3 md:px-5">
        <h2 id="precios-titulo" className="text-lg font-semibold text-foreground">Precios por supermercado</h2>
        <p className="text-sm text-muted-foreground">{pluralize(entries.length, "supermercado")}, de menor a mayor precio</p>
      </div>
      <ComparisonTable rows={rows} productName={productName} showPromoPrice={showPromoPrice} />
      <ul className="divide-y divide-border border-t border-border md:hidden">
        {rows.map((row) => <MobileRow key={row.entry.supermarket.slug} {...row} showPromoPrice={showPromoPrice} />)}
      </ul>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-5">
        Precios relevados en la web de cada supermercado; la variación compara con el último precio distinto de los últimos {PREVIOUS_PRICE_WINDOW_DAYS} días.{" "}
        <Link href="/metodologia" className="font-medium text-foreground underline underline-offset-4">Cómo relevamos</Link>
      </p>
    </section>
  );
}
