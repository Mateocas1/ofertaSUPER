"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useState, useTransition } from "react";
import { LoaderCircle, Search } from "lucide-react";

import { buttonVariants } from "@/components/ui/button-variants";
import { formatCurrency } from "@/lib/format";
import { getPriceFreshnessCopy, type PriceFreshnessStatus } from "@/lib/price-freshness";
import { cn } from "@/lib/utils";

type SearchSuggestion = {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  minPrice: number | null;
  bestPriceCheckedAt: string | null;
  freshnessStatus: PriceFreshnessStatus;
};

type SearchBarProps = {
  defaultValue?: string;
  placeholder?: string;
  variant?: "hero" | "compact";
};

export function SearchBar({
  defaultValue = "",
  placeholder = "Buscar yerba, leche, arroz o una marca puntual",
  variant = "hero",
}: SearchBarProps) {
  const router = useRouter();
  const searchId = useId();
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<SearchSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredQuery = useDeferredValue(query);
  const resultsId = `${searchId}-results`;
  const activeOptionId = activeIndex >= 0 ? `${searchId}-option-${activeIndex}` : undefined;

  useEffect(() => {
    setQuery(defaultValue);
    setHasInteracted(false);
    setOpen(false);
  }, [defaultValue]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [results]);

  useEffect(() => {
    const trimmed = deferredQuery.trim();

    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}&limit=8`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as { items: SearchSuggestion[] };
      startTransition(() => {
        setResults(payload.items);
        setOpen(hasInteracted);
      });
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [deferredQuery, hasInteracted]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim();

    if (!trimmed) {
      return;
    }

    setOpen(false);
    router.push(`/buscar?q=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (event.key === "ArrowDown" && results.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }

      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      setOpen(false);
      router.push(`/producto/${results[activeIndex].ean}`);
    }
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} role="search" aria-label="Buscar productos" className="relative">
        <label htmlFor={`${searchId}-${variant}`} className="sr-only">
          Buscar producto
        </label>
        <div
          className={cn(
            "flex items-center gap-3 rounded-[1.6rem] border border-border/70 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.08)] backdrop-blur",
            variant === "hero" ? "px-4 py-4 md:px-5" : "px-3 py-3",
          )}
        >
          <Search className="size-5 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${searchId}-${variant}`}
            value={query}
            onChange={(event) => {
              setHasInteracted(true);
              setQuery(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setHasInteracted(true);
              if (results.length > 0) {
                setOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            placeholder={placeholder}
            autoComplete="off"
            className={cn(
              "w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
              variant === "hero" ? "text-base md:text-lg" : "text-sm",
            )}
            role="combobox"
            aria-expanded={open}
            aria-controls={resultsId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={activeOptionId}
          />

          <button
            type="submit"
            className={cn(buttonVariants({ size: variant === "hero" ? "lg" : "sm" }), "rounded-full px-4")}
            aria-label="Ejecutar búsqueda"
          >
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : "Buscar"}
          </button>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {open ? `${results.length} sugerencias disponibles` : "Sugerencias ocultas"}
      </p>

      {open ? (
        <div
          id={resultsId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+0.75rem)] z-50 overflow-hidden rounded-[1.5rem] border border-border/70 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.14)] backdrop-blur"
        >
          {results.length > 0 ? (
            results.map((result, index) => (
              <Link
                key={result.ean}
                id={`${searchId}-option-${index}`}
                href={`/producto/${result.ean}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex min-h-16 items-center gap-4 border-t border-border/50 px-4 py-3 first:border-t-0 hover:bg-muted/50 focus-visible:bg-muted/50",
                  index === activeIndex && "bg-muted/50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
              >
                    <div className="relative size-14 overflow-hidden rounded-2xl border border-border/70 bg-muted/40">
                      {result.imageUrl ? (
                        <Image src={result.imageUrl} alt={result.name} fill sizes="56px" className="object-cover" unoptimized />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{result.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {[result.brand, result.category].filter(Boolean).join(" • ") || "Sin datos extra"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{formatCurrency(result.minPrice)}</p>
                      {result.freshnessStatus === "stale" ? (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          {getPriceFreshnessCopy({
                            status: result.freshnessStatus,
                            checkedAt: result.bestPriceCheckedAt,
                            ageHours: null,
                            maxAgeHours: 0,
                          }).badgeLabel}
                        </p>
                      ) : null}
                    </div>
              </Link>
            ))
          ) : (
            <div className="px-4 py-5 text-sm text-muted-foreground">Sin coincidencias por ahora.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
