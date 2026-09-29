import { formatCurrency, formatPercent } from "@/lib/format";
import { detectAutomaticDiscount } from "@/lib/promotions/detect";

// Gate 4a: one shared strike-through for every surface. The discount math
// comes from the same pure function the catalog adapters use.
export function StruckListPrice({ price, listPrice }: { price: number | null; listPrice: number | null }) {
  const discount = detectAutomaticDiscount(price, listPrice);
  if (!discount || listPrice === null) return null;

  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <s className="text-sm text-muted-foreground" aria-label={`Precio de lista ${formatCurrency(listPrice)}`}>
        {formatCurrency(listPrice)}
      </s>
      <span className="text-sm font-medium text-primary">{formatPercent(discount.percentOff, 0)} OFF</span>
    </span>
  );
}
