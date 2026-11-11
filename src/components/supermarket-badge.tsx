import { cn } from "@/lib/utils";

type SupermarketBadgeProps = {
  name: string;
  slug: string;
  logoUrl: string | null;
  price?: string | null;
  /** Marks the cheapest offer: green text plus words, never color alone. */
  highlight?: boolean;
  className?: string;
};

// Supermarkets are identified by name. Colored initials were dropped: Carrefour
// and Coto both read "C", and Coto and Disco are both red.
export function SupermarketBadge({ name, slug, price, highlight = false, className }: SupermarketBadgeProps) {
  return (
    <span
      data-supermarket={slug}
      className={cn(
        "inline-flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-sm",
        highlight ? "border-primary/40 bg-accent text-accent-foreground" : "border-border bg-card text-foreground",
        className,
      )}
    >
      <span className="font-medium">{name}</span>
      {price ? (
        <span className={cn("tabular-nums", highlight ? "font-semibold" : "text-muted-foreground")}>{price}</span>
      ) : null}
    </span>
  );
}
