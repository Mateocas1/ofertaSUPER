import type { ReactNode } from "react";

import { ProductCard } from "@/components/product-card";
import type { ProductSummary } from "@/lib/catalog";

/** Fail-closed state: the snapshot did not load, so nothing is shown as a price. */
export function CatalogUnavailable({ children }: { children: ReactNode }) {
  return (
    <section role="alert" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p className="font-semibold">El catálogo no está disponible.</p>
      <p className="mt-1">{children}</p>
    </section>
  );
}

export function CatalogMessage({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="surface px-4 py-6 text-sm md:px-5">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children ? <div className="mt-1 text-muted-foreground">{children}</div> : null}
    </section>
  );
}

// The sr-only h2 keeps the heading outline h1 > h2 > h3 (each card is an h3).
export function ProductGrid({ products, label }: { products: ProductSummary[]; label: string }) {
  return (
    <section aria-label={label}>
      <h2 className="sr-only">{label}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => <ProductCard key={product.ean} product={product} />)}
      </div>
    </section>
  );
}
