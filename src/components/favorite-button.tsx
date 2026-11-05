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

function getFavoriteLabel(active: boolean, productName: string) {
  return active ? `Quitar ${productName} de favoritos` : `Guardar ${productName} en favoritos`;
}

// Without a label the button is a square icon target (44px); a label widens it.
function getFavoriteButtonClassName(active: boolean, size: "sm" | "default", showLabel: boolean, className?: string) {
  const iconSize = size === "sm" ? "icon-sm" : "icon";
  return cn(
    buttonVariants({ variant: active ? "secondary" : "outline", size: showLabel ? size : iconSize }),
    "press",
    active && "text-deal-ink",
    className,
  );
}

function getFavoriteText(active: boolean, showLabel: boolean) {
  if (!showLabel) return null;
  return active ? "Guardado" : "Guardar";
}

export function FavoriteButton({
  ean,
  productName = "este producto",
  className,
  size = "default",
  showLabel = false,
}: FavoriteButtonProps) {
  const { hasHydrated, isFavorite, toggleFavorite } = useFavorites();
  const active = hasHydrated && isFavorite(ean);
  const label = getFavoriteLabel(active, productName);

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={!hasHydrated}
      onClick={() => toggleFavorite(ean)}
      className={getFavoriteButtonClassName(active, size, showLabel, className)}
    >
      <Heart className={cn("size-4", active && "fill-current")} aria-hidden="true" />
      {getFavoriteText(active, showLabel)}
    </button>
  );
}