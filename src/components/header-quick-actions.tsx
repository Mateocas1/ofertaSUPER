"use client";

import Link from "next/link";
import { Heart, ShoppingBasket } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { useCanasta } from "@/hooks/use-canasta";
import { useFavorites } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";

export function HeaderQuickActions() {
  const { count: favoriteCount, hasHydrated: favoritesReady } = useFavorites();
  const { totalItems, hasHydrated: canastaReady } = useCanasta();

  return (
    <div className="flex items-center justify-end gap-2">
      <span
        className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/80 px-3 py-2 text-sm text-muted-foreground"
        aria-live="polite"
      >
        <Heart className="size-4" />
        <span className="hidden sm:inline">Favoritos</span>
        <strong className="text-foreground">{favoritesReady ? favoriteCount : 0}</strong>
      </span>

      <Link href="/canasta" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full px-3")}>
        <ShoppingBasket className="size-4" />
        <span>Canasta</span>
        <strong className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{canastaReady ? totalItems : 0}</strong>
      </Link>
    </div>
  );
}