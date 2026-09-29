import { cn } from "@/lib/utils";

type PromotionType = "2x1" | "2nd_50" | "wallet_discount" | "bank_discount" | "percentage";

const styles: Record<PromotionType, { label: string; className: string }> = {
  "2x1": {
    label: "2x1",
    className: "border-primary/30 bg-accent text-accent-foreground",
  },
  "2nd_50": {
    label: "2da al 50%",
    className: "border-chart-2/40 bg-chart-2/20 text-foreground",
  },
  wallet_discount: {
    label: "Billetera",
    className: "border-chart-3/40 bg-chart-3/15 text-foreground",
  },
  bank_discount: {
    label: "Banco",
    className: "border-deal/40 bg-deal-soft text-deal-ink",
  },
  percentage: {
    label: "% OFF",
    className: "border-transparent bg-deal text-deal-foreground",
  },
};

type PromotionBadgeProps = {
  type: PromotionType;
  label?: string;
  className?: string;
};

export function PromotionBadge({ type, label, className }: PromotionBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-[0.08em] tabular-nums",
        styles[type].className,
        className,
      )}
    >
      {label ?? styles[type].label}
    </span>
  );
}
