"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBasket } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { useCanasta } from "@/hooks/use-canasta";
import { SITE_NAV } from "@/lib/site-nav";
import { cn } from "@/lib/utils";

function isCurrentSection(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BasketLink() {
  const { items } = useCanasta();
  const count = items.length;
  const label = count === 0 ? "Canasta" : `Canasta, ${count} ${count === 1 ? "producto" : "productos"}`;

  return (
    <Link
      href="/canasta"
      aria-label={label}
      className="press inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-foreground/30"
    >
      <ShoppingBasket className="size-4" aria-hidden="true" />
      <span className="hidden sm:inline">Canasta</span>
      {count > 0 ? (
        <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-semibold tabular-nums text-primary-foreground">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="container-page flex flex-wrap items-center gap-x-8">
        <Link href="/" className="inline-flex min-h-14 items-center gap-2.5" aria-label="ofertasSUPER, inicio">
          <BrandMark className="size-8" />
          <span className="font-display text-xl font-extrabold tracking-[-0.03em] text-foreground">
            ofertas<span className="text-primary">SUPER</span>
          </span>
        </Link>

        <div className="ml-auto sm:order-last">
          <BasketLink />
        </div>

        <nav
          aria-label="Principal"
          className="-mx-4 flex w-[calc(100%+2rem)] gap-1 overflow-x-auto px-3 text-sm sm:mx-0 sm:w-auto sm:px-0"
        >
          {SITE_NAV.map((item) => {
            const isCurrent = isCurrentSection(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 shrink-0 items-center px-2.5 text-muted-foreground [transition:color_160ms_var(--ease-out)] hover:text-foreground",
                  isCurrent && "font-medium text-foreground",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute inset-x-2.5 bottom-0 h-0.5 bg-foreground opacity-0",
                    isCurrent && "opacity-100",
                  )}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
