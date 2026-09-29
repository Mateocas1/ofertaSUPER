import { cn } from "@/lib/utils";

type SupermarketBadgeProps = {
  name: string;
  slug: string;
  logoUrl: string | null;
  price?: string | null;
  className?: string;
};

const badgeStyles: Record<string, string> = {
  carrefour: "bg-[#0f4c81] text-white",
  dia: "bg-[#b81c2a] text-white",
  disco: "bg-[#a63a25] text-white",
  jumbo: "bg-[#1d6b52] text-white",
  mas: "bg-[#7a2e9b] text-white",
  vea: "bg-[#8f5a0c] text-white",
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function SupermarketBadge({ name, slug, price, className }: SupermarketBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-surface-3/70 py-1.5 pl-1.5 pr-3 text-sm text-foreground",
        className,
      )}
    >
      <div className={cn("flex size-7 items-center justify-center rounded-full text-[10px] font-bold uppercase", badgeStyles[slug] ?? "bg-muted text-muted-foreground") }>
        <span aria-hidden="true">{getInitials(name)}</span>
      </div>
      <span className="font-medium text-foreground">{name}</span>
      {price ? <span className="font-mono font-semibold tabular-nums text-muted-foreground">{price}</span> : null}
    </div>
  );
}
