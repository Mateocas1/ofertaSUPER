"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useId, useState, useTransition } from "react";
import { LoaderCircle, Package, Search } from "lucide-react";

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
  displayPrice?: number | null;
  bestPriceCheckedAt: string | null;
  freshnessStatus: PriceFreshnessStatus;
};

type SearchBarProps = {
  defaultValue?: string;
  placeholder?: string;
  variant?: "hero" | "compact";
};

type SuggestionOptionProps = {
  result: SearchSuggestion;
  id: string;
  active: boolean;
  onActivate: () => void;
};

function SuggestionOption({ result, id, active, onActivate }: SuggestionOptionProps) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <Link
      id={id}
      href={`/producto/${result.ean}`}
      role="option"
      aria-selected={active}
      className={cn(
        "flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:bg-muted",
        active && "bg-muted",
      )}
      onMouseEnter={onActivate}
    >
      <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
        <Package className="absolute inset-0 m-auto size-4 text-muted-foreground/50" aria-hidden="true" />
        {result.imageUrl && !imageFailed ? (
          <Image src={result.imageUrl} alt="" fill sizes="40px" className="img-outline object-contain" onError={() => setImageFailed(true)} unoptimized />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
        {result.brand ? <p className="truncate text-xs text-muted-foreground">{result.brand}</p> : null}
      </div>
      <div className="text-right">
        <p className="price text-sm text-foreground">{formatCurrency(result.displayPrice ?? result.minPrice)}</p>
        {result.freshnessStatus === "stale" ? (
          <p className="mt-1 text-xs font-medium text-warning">
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
  );
}

const VARIANT_STYLES = {
  hero: {
    field: "min-h-14 py-1.5 pl-4 pr-1.5",
    input: "text-base md:text-lg",
    buttonSize: "default",
  },
  compact: {
    field: "min-h-12 py-0.5 pl-3 pr-0.5",
    input: "text-base",
    buttonSize: "default",
  },
} as const;

export function SearchBar({
  defaultValue = "",
  placeholder = "Buscá yerba, leche, arroz o una marca",
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
  const styles = VARIANT_STYLES[variant];
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

    // No suggestions request until the person types or focuses the field: a
    // results page that arrives with ?q= must not call /api/search on load.
    if (!hasInteracted || trimmed.length < 2) {
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
      <form action="/buscar" onSubmit={handleSubmit} role="search" aria-label="Buscar productos" className="relative">
        <label htmlFor={`${searchId}-${variant}`} className="sr-only">
          Buscar producto
        </label>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30",
            styles.field,
          )}
        >
          <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            id={`${searchId}-${variant}`}
            name="q"
            type="search"
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
              "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden",
              styles.input,
            )}
            role="combobox"
            aria-expanded={open}
            aria-controls={resultsId}
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-activedescendant={activeOptionId}
          />

          <button type="submit" className={cn(buttonVariants({ size: styles.buttonSize }), "press px-4")}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Buscar
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
          className="absolute inset-x-0 top-full z-50 mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-popover shadow-3"
        >
          {results.length > 0 ? (
            results.map((result, index) => (
              <SuggestionOption
                key={result.ean}
                result={result}
                id={`${searchId}-option-${index}`}
                active={index === activeIndex}
                onActivate={() => setActiveIndex(index)}
              />
            ))
          ) : (
            <div className="px-4 py-4 text-sm text-muted-foreground">No encontramos coincidencias.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
