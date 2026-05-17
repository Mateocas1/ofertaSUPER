import { cn } from "@/lib/utils";

type PromotionType = "2x1" | "2nd_50" | "wallet_discount" | "bank_discount" | "percentage";

const styles: Record<PromotionType, { label: string; className: string }> = {
  "2x1": {
    label: "2x1",
    className: "border-emerald-200 bg-emerald-50 text-emerald-900",
  },
  "2nd_50": {
    label: "2da al 50%",
    className: "border-lime-200 bg-lime-50 text-lime-900",
  },
  wallet_discount: {
    label: "Billetera",
    className: "border-sky-200 bg-sky-50 text-sky-900",
  },
  bank_discount: {
    label: "Banco",
    className: "border-orange-200 bg-orange-50 text-orange-900",
  },
  percentage: {
    label: "% OFF",
    className: "border-rose-200 bg-rose-50 text-rose-900",
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
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        styles[type].className,
        className,
      )}
    >
      {label ?? styles[type].label}
    </span>
  );
}
