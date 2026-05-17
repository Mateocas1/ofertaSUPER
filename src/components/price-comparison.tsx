import Link from "next/link";

import { PromotionBadge } from "@/components/promotion-badge";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type PriceComparisonProps = {
  entries: Array<{
    supermarket: {
      id: number;
      name: string;
      slug: string;
      logoUrl: string | null;
    };
    price: number | null;
    previousPrice: number | null;
    deltaPercent: number | null;
    priceDropAlert: {
      previousPrice: number;
      currentPrice: number;
      amountDrop: number;
      percentDrop: number;
    } | null;
    automaticDiscountPercent: number | null;
    bestPromotion: {
      id: number;
      title: string;
      type: "2x1" | "2nd_50" | "wallet_discount" | "bank_discount" | "percentage";
    } | null;
    finalPrice: number | null;
    productUrl: string | null;
    lastCheckedAt: string;
  }>;
};

export function PriceComparison({ entries }: PriceComparisonProps) {
  if (entries.length === 0) {
    return (
      <div className="surface-soft p-6 text-sm text-muted-foreground">
        Todavia no hay precios comparables para este producto.
      </div>
    );
  }

  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-border/70 px-6 py-5">
        <h2 className="text-2xl font-semibold text-foreground">Comparativa por supermercado</h2>
        <p className="mt-1 text-sm text-muted-foreground">Precio actual, promo aplicable y precio final cuando se puede estimar.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Super</th>
              <th className="px-6 py-3 font-medium">Precio</th>
              <th className="px-6 py-3 font-medium">Promo</th>
              <th className="px-6 py-3 font-medium">Precio final</th>
              <th className="px-6 py-3 font-medium">Precio anterior</th>
              <th className="px-6 py-3 font-medium">Delta</th>
              <th className="px-6 py-3 font-medium">Actualizado</th>
              <th className="px-6 py-3 font-medium">Link</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.supermarket.slug} className="border-t border-border/60">
                <td className="px-6 py-4">
                  <SupermarketBadge
                    name={entry.supermarket.name}
                    slug={entry.supermarket.slug}
                    logoUrl={entry.supermarket.logoUrl}
                  />
                </td>
                <td className="px-6 py-4 font-semibold text-foreground">{formatCurrency(entry.price)}</td>
                <td className="px-6 py-4">
                  {entry.bestPromotion ? (
                    <div className="space-y-2">
                      <PromotionBadge type={entry.bestPromotion.type} />
                      <p className="max-w-44 text-xs leading-5 text-muted-foreground">{entry.bestPromotion.title}</p>
                    </div>
                  ) : entry.automaticDiscountPercent ? (
                    <PromotionBadge
                      type="percentage"
                      label={`${formatPercent(entry.automaticDiscountPercent, 0)} OFF`}
                    />
                  ) : (
                    <span className="text-muted-foreground">Sin promo</span>
                  )}
                </td>
                <td className={cn("px-6 py-4 font-semibold", entry.finalPrice !== null ? "text-emerald-700" : "text-muted-foreground")}>
                  {entry.finalPrice !== null ? formatCurrency(entry.finalPrice) : "No calculable"}
                </td>
                <td className="px-6 py-4 text-muted-foreground">{formatCurrency(entry.previousPrice)}</td>
                <td
                  className={cn(
                    "px-6 py-4 font-medium",
                    entry.deltaPercent !== null && entry.deltaPercent > 0 && "text-rose-700",
                    entry.deltaPercent !== null && entry.deltaPercent < 0 && "text-emerald-700",
                  )}
                >
                  <div>
                    <p>{formatPercent(entry.deltaPercent)}</p>
                    {entry.priceDropAlert ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        Ahorra {formatCurrency(entry.priceDropAlert.amountDrop)}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="px-6 py-4 text-muted-foreground">{formatDateTime(entry.lastCheckedAt)}</td>
                <td className="px-6 py-4">
                  {entry.productUrl ? (
                    <Link
                      href={entry.productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
                    >
                      Abrir
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">Sin link</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
