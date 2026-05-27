"use client";

import type { SVGProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { HOME_HEADER_NAV } from "@/lib/home-ui-data";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/92 px-4 backdrop-blur-md sm:px-6">
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-[1512px] flex-wrap items-center justify-between gap-4 py-3">
        <Link href="/" className="group inline-flex items-center gap-3" aria-label="ofertasSUPER inicio">
          <span className="relative flex h-9 w-11 items-center justify-center text-[1.45rem] font-black tracking-[-0.18em] text-primary">
            <span className="absolute left-0 h-6 w-6 rounded-full border-[5px] border-current" aria-hidden="true" />
            <span className="absolute right-1 h-6 w-6 rounded-full border-[5px] border-current opacity-90" aria-hidden="true" />
            <span className="sr-only">OS</span>
          </span>
          <span className="text-xl font-bold tracking-[-0.04em] text-foreground">
            ofertas<span className="text-primary">SUPER</span>
          </span>
        </Link>

        <nav aria-label="Principal" className="order-3 flex w-full justify-center gap-7 overflow-x-auto text-sm font-medium text-muted-foreground sm:order-none sm:w-auto lg:gap-10">
          {HOME_HEADER_NAV.map((item) => {
            const isCurrent = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "relative px-1 py-4 transition duration-200 hover:text-primary active:translate-y-px",
                  isCurrent && "text-primary",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "absolute inset-x-0 bottom-0 h-px origin-center scale-x-0 bg-primary transition-transform duration-300",
                    isCurrent && "scale-x-100",
                  )}
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </nav>

        <Link
          href="/canasta"
          aria-label="Ver canasta"
          className="inline-flex items-center gap-2 rounded-[0.65rem] border border-primary/45 bg-card px-3 py-2.5 text-sm font-semibold text-foreground transition duration-200 hover:border-primary hover:text-primary active:translate-y-px"
        >
          <BasketIcon className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ver canasta</span>
        </Link>
      </div>
    </header>
  );
}

function BasketIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 9h14l-1.2 9.5a2 2 0 0 1-2 1.5H8.2a2 2 0 0 1-2-1.5L5 9Z" />
      <path d="M9 9a3 3 0 0 1 6 0" />
      <path d="M9 13v3" />
      <path d="M15 13v3" />
    </svg>
  );
}



