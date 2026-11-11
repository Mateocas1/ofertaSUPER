import Link from "next/link";
import { AlertCircle, Trash2 } from "lucide-react";

import { ProductThumb } from "@/components/product-thumb";
import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import type { CanastaItem } from "@/hooks/use-canasta";
import type { BasketPlanItem } from "@/lib/basket-mix";
import type { BasketProduct } from "@/lib/basket-products-contract";
import { formatCurrency } from "@/lib/format";
import { promotionLabel } from "@/lib/product-card-offers";
import { cn } from "@/lib/utils";

type RowProps = {
  item: CanastaItem;
  product: BasketProduct | undefined;
  planItem: BasketPlanItem;
  degradedDemo: boolean;
  removeItem: (ean: string) => void;
  onSelect: (ean: string, slug: string) => void;
};

function ItemTitle({ item, product }: { item: CanastaItem; product: BasketProduct | undefined }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-medium text-foreground">
          {product ? (
            <Link href={`/producto/${item.ean}`} className="hover:text-primary">
              {product.name}
            </Link>
          ) : (
            `Producto ${item.ean}`
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{product?.brand ?? "Sin marca"}</p>
      </div>
      <FavoriteButton ean={item.ean} productName={product?.name ?? item.ean} size="sm" />
    </div>
  );
}

function ChosenLine({ planItem, degradedDemo }: { planItem: BasketPlanItem; degradedDemo: boolean }) {
  if (!planItem.chosenName) {
    return <p className="mt-1 text-sm text-muted-foreground">Sin precio elegible para este producto.</p>;
  }
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      En {planItem.chosenName}: <span className="price text-foreground">{formatCurrency(planItem.lineTotal)}</span>
      {degradedDemo ? " (estimación histórica)" : ""}
    </p>
  );
}

function SuperSelector({ planItem, onSelect }: { planItem: BasketPlanItem; onSelect: RowProps["onSelect"] }) {
  if (planItem.options.length === 0) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="sr-only">Supermercado para {planItem.ean}</span>
      <span aria-hidden="true">Súper</span>
      <select
        value={planItem.chosenSlug ?? ""}
        onChange={(event) => onSelect(planItem.ean, event.target.value)}
        className="min-h-11 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
      >
        {planItem.options.map((option) => (
          <option key={option.slug} value={option.slug}>
            {option.name} — {formatCurrency(option.price)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProductPrices({ item, product, chosenSlug }: { item: CanastaItem; product: BasketProduct | undefined; chosenSlug: string | null }) {
  if (!product) {
    return (
      <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-4" aria-hidden="true" />
        Todavía no tenemos el detalle de este producto.
      </p>
    );
  }
  const entries = product.priceEntries.slice(0, 4);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {entries.map((entry) => (
        <SupermarketBadge
          key={`${item.ean}-${entry.supermarket.slug}`}
          name={entry.supermarket.name}
          slug={entry.supermarket.slug}
          logoUrl={entry.supermarket.logoUrl}
          highlight={entry.supermarket.slug === chosenSlug}
          price={entry.isAvailable ? formatCurrency(entry.price) : "No disponible"}
        />
      ))}
      {entries
        .filter((entry) => entry.isAvailable && entry.promo)
        .map((entry) => (
          <PromotionBadge
            key={`${item.ean}-${entry.supermarket.slug}-promo`}
            type={entry.promo!.type === "nth-unit" ? "2nd_50" : "percentage"}
            label={promotionLabel(entry.promo!)}
          />
        ))}
      {entries
        .filter((entry) => entry.isAvailable)
        .map((entry) => (
          <StruckListPrice key={`${item.ean}-${entry.supermarket.slug}-list`} price={entry.price} listPrice={entry.listPrice} />
        ))}
    </div>
  );
}

export function BasketItemRow({ item, product, planItem, degradedDemo, removeItem, onSelect }: RowProps) {
  return (
    <article className="flex gap-3 p-4 sm:gap-4 md:p-5">
      <ProductThumb src={product?.imageUrl ?? null} />
      <div className="min-w-0 flex-1">
        <ItemTitle item={item} product={product} />
        <ChosenLine planItem={planItem} degradedDemo={degradedDemo} />
        <ProductPrices item={item} product={product} chosenSlug={planItem.chosenSlug} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <BasketControls ean={item.ean} productName={product?.name ?? item.ean} />
          <SuperSelector planItem={planItem} onSelect={onSelect} />
          <button
            type="button"
            onClick={() => removeItem(item.ean)}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "min-h-11 rounded-lg text-muted-foreground")}
            aria-label={`Quitar ${product?.name ?? item.ean} de la canasta`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Quitar
          </button>
        </div>
      </div>
    </article>
  );
}
