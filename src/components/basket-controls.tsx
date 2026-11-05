"use client";

import { Minus, Plus, ShoppingBasket } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { useCanasta } from "@/hooks/use-canasta";
import { cn } from "@/lib/utils";

type BasketControlsProps = {
  ean: string;
  productName?: string;
  className?: string;
  compact?: boolean;
};

export function BasketControls({
  ean,
  productName = "este producto",
  className,
  compact = false,
}: BasketControlsProps) {
  const { addItem, decrementItem, getQuantity, hasHydrated, incrementItem } = useCanasta();
  const quantity = getQuantity(ean);

  if (!hasHydrated || quantity === 0) {
    return (
      <button
        type="button"
        disabled={!hasHydrated}
        onClick={() => addItem(ean, 1)}
        className={cn(buttonVariants({ variant: "outline", size: compact ? "sm" : "default" }), "press", className)}
        aria-label={`Agregar ${productName} a la canasta`}
      >
        <ShoppingBasket className="size-4" aria-hidden="true" />
        {compact ? "Agregar" : "Agregar a la canasta"}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={`Cantidad en canasta para ${productName}`}
      className={cn("inline-flex items-center rounded-lg border border-border bg-card", className)}
    >
      <button
        type="button"
        onClick={() => decrementItem(ean)}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-r-none")}
        aria-label={`Quitar una unidad de ${productName}`}
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold tabular-nums text-foreground" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={() => incrementItem(ean)}
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "rounded-l-none")}
        aria-label={`Agregar una unidad de ${productName}`}
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
