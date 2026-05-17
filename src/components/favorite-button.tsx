"use client";

import { Heart } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { useFavorites } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = {
  ean: string;
  productName?: string;
  className?: string;
  size?: "sm" | "default";
  showLabel?: boolean;
};

export function FavoriteButton({
  ean,
  productName = "este producto",
  className,
  size = "default",
  showLabel = false,
}: FavoriteButtonProps) {
  const { hasHydrated, isFavorite, toggleFavorite } = useFavorites();
  const active = hasHydrated && isFavorite(ean);
  const label = active ? `Quitar ${productName} de favoritos` : `Guardar ${productName} en favoritos`;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={!hasHydrated}
      onClick={() => toggleFavorite(ean)}
      className={cn(
        buttonVariants({ variant: active ? "secondary" : "outline", size: size === "sm" ? "sm" : "default" }),
        "rounded-full",
        className,
      )}
    >
      <Heart className={cn("size-4", active && "fill-current")} />
      {showLabel ? (active ? "Guardado" : "Favorito") : null}
    </button>
  );
}