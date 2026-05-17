"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, ShoppingBasket, Trash2 } from "lucide-react";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { useCanasta, type CanastaItem } from "@/hooks/use-canasta";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type CanastaProduct = {
  ean: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  minPrice: number | null;
  priceEntries: Array<{
    supermarket: {
      id: number;
      name: string;
      slug: string;
      logoUrl: string | null;
    };
    price: number | null;
    isAvailable: boolean;
    productUrl: string | null;
  }>;
};

type SupermarketSummary = {
  slug: string;
  name: string;
  logoUrl: string | null;
  total: number;
  coveredItems: number;
  missingItems: number;
};

function buildSupermarketSummaries(items: CanastaItem[], productsByEan: Record<string, CanastaProduct>) {
  const summaryMap = new Map<string, SupermarketSummary>();

  for (const item of items) {
    const product = productsByEan[item.ean];

    if (!product) {
      continue;
    }

    for (const entry of product.priceEntries) {
      if (!summaryMap.has(entry.supermarket.slug)) {
        summaryMap.set(entry.supermarket.slug, {
          slug: entry.supermarket.slug,
          name: entry.supermarket.name,
          logoUrl: entry.supermarket.logoUrl,
          total: 0,
          coveredItems: 0,
          missingItems: 0,
        });
      }
    }
  }

  const summaries = Array.from(summaryMap.values());

  for (const item of items) {
    const product = productsByEan[item.ean];

    if (!product) {
      continue;
    }

    for (const summary of summaries) {
      const entry = product.priceEntries.find((candidate) => candidate.supermarket.slug === summary.slug);

      if (entry && entry.price !== null && entry.isAvailable) {
        summary.coveredItems += 1;
        summary.total += entry.price * item.qty;
      } else {
        summary.missingItems += 1;
      }
    }
  }

  return summaries.toSorted((left, right) => {
    if (left.missingItems !== right.missingItems) {
      return left.missingItems - right.missingItems;
    }

    return left.total - right.total;
  });
}

export function CanastaPage() {
  const { clearCanasta, distinctItems, hasHydrated, items, removeItem, totalItems } = useCanasta();
  const [productsByEan, setProductsByEan] = useState<Record<string, CanastaProduct>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const uniqueEansKey = Array.from(new Set(items.map((item) => item.ean))).sort().join("|");

  useEffect(() => {
    if (!uniqueEansKey) {
      setProductsByEan({});
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    const eans = uniqueEansKey.split("|").filter(Boolean);

    void (async () => {
      try {
        const responses = await Promise.all(
          eans.map(async (ean) => {
            const response = await fetch(`/api/products/${ean}`, {
              signal: controller.signal,
            });

            if (!response.ok) {
              return null;
            }

            const payload = (await response.json()) as CanastaProduct;
            return payload;
          }),
        );

        const nextProducts = responses.reduce<Record<string, CanastaProduct>>((accumulator, product) => {
          if (product) {
            accumulator[product.ean] = product;
          }

          return accumulator;
        }, {});

        startTransition(() => {
          setProductsByEan(nextProducts);
          setLoadError(null);
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "No se pudo cargar la canasta.");
      }
    })();

    return () => controller.abort();
  }, [uniqueEansKey]);

  const summaries = buildSupermarketSummaries(items, productsByEan);
  const bestCompleteSummary = summaries.find((summary) => summary.missingItems === 0) ?? null;
  const unresolvedItems = items.filter((item) => !productsByEan[item.ean]);

  if (!hasHydrated) {
    return (
      <div className="surface-soft flex min-h-72 items-center justify-center p-8 text-sm text-muted-foreground">
        Cargando canasta local...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <section className="surface p-8 md:p-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <ShoppingBasket className="size-8" />
          </span>
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Canasta</p>
            <h1 className="text-4xl font-semibold text-foreground md:text-5xl">Todavia no agregaste productos.</h1>
            <p className="text-base leading-7 text-muted-foreground md:text-lg">
              Usa la canasta para estimar el total por supermercado con los productos que ya vienes comparando.
            </p>
          </div>
          <Link href="/buscar" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
            Explorar catalogo
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-5">
        <div className="surface p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Canasta activa</p>
              <h1 className="mt-2 text-4xl font-semibold text-foreground md:text-5xl">{distinctItems} productos, {totalItems} unidades</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
                Ajusta cantidades y compara cuanto costaria resolver la canasta en cada supermercado con la cobertura actual.
              </p>
            </div>

            <button
              type="button"
              onClick={clearCanasta}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
            >
              Vaciar canasta
            </button>
          </div>

          {loadError ? (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {loadError}
            </p>
          ) : null}

          {unresolvedItems.length > 0 ? (
            <p className="mt-5 rounded-2xl border border-border/70 bg-white/80 px-4 py-3 text-sm text-muted-foreground">
              {unresolvedItems.length} producto(s) todavia no pudieron resolverse desde la API. El comparador sigue calculando con los items cargados.
            </p>
          ) : null}
        </div>

        <div className="space-y-4">
          {items.map((item) => {
            const product = productsByEan[item.ean];
            const lineTotal = product?.minPrice !== null && product?.minPrice !== undefined ? product.minPrice * item.qty : null;

            return (
              <article key={item.ean} className="surface-soft p-5">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="relative size-20 shrink-0 overflow-hidden rounded-[1.5rem] border border-border/70 bg-muted/40">
                      {product?.imageUrl ? (
                        <Image src={product.imageUrl} alt={product.name} fill sizes="80px" className="object-cover" unoptimized />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
                          Sin foto
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          EAN {item.ean}
                        </span>
                        <FavoriteButton ean={item.ean} productName={product?.name ?? item.ean} size="sm" />
                      </div>

                      <h2 className="mt-3 text-xl font-semibold text-foreground">
                        {product ? (
                          <Link href={`/producto/${item.ean}`} className="hover:text-primary">
                            {product.name}
                          </Link>
                        ) : (
                          `Producto ${item.ean}`
                        )}
                      </h2>

                      <p className="mt-1 text-sm text-muted-foreground">
                        {product?.brand ?? "Sin detalle adicional"}
                      </p>

                      <p className="mt-3 text-sm text-muted-foreground">
                        Mejor total actual: <strong className="text-foreground">{formatCurrency(lineTotal)}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <BasketControls ean={item.ean} productName={product?.name ?? item.ean} />
                    <button
                      type="button"
                      onClick={() => removeItem(item.ean)}
                      className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full text-muted-foreground")}
                      aria-label={`Eliminar ${product?.name ?? item.ean} de la canasta`}
                    >
                      <Trash2 className="size-4" />
                      Quitar
                    </button>
                  </div>
                </div>

                {product ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {product.priceEntries.slice(0, 4).map((entry) => (
                      <SupermarketBadge
                        key={`${item.ean}-${entry.supermarket.slug}`}
                        name={entry.supermarket.name}
                        slug={entry.supermarket.slug}
                        logoUrl={entry.supermarket.logoUrl}
                        price={entry.isAvailable ? formatCurrency(entry.price) : "No disp."}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertCircle className="size-4" />
                    Sin detalle cargado por ahora
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <aside className="space-y-5">
        <section className="surface p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Comparativa</p>
              <h2 className="mt-2 text-3xl font-semibold text-foreground">Total por supermercado</h2>
            </div>
            {isPending ? <LoaderCircle className="size-5 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="mt-6 space-y-4">
            {summaries.map((summary) => {
              const isBestComplete = bestCompleteSummary?.slug === summary.slug;

              return (
                <article
                  key={summary.slug}
                  className={cn(
                    "rounded-[1.5rem] border p-5",
                    isBestComplete ? "border-emerald-300 bg-emerald-50/80" : "border-border/70 bg-white/80",
                  )}
                >
                  <div className="flex items-center justify-between gap-4">
                    <SupermarketBadge
                      name={summary.name}
                      slug={summary.slug}
                      logoUrl={summary.logoUrl}
                    />
                    {isBestComplete ? (
                      <span className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-900">
                        Mejor canasta completa
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-5 text-4xl font-semibold text-foreground">{formatCurrency(summary.total)}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>{summary.coveredItems} items cubiertos</span>
                    <span>•</span>
                    <span>{summary.missingItems} faltantes</span>
                  </div>
                </article>
              );
            })}

            {summaries.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-border bg-white/70 p-5 text-sm text-muted-foreground">
                Aun no hay suficiente cobertura multi-super para calcular un total agregado.
              </div>
            ) : null}
          </div>
        </section>

        <section className="surface-soft p-6">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Lectura rapida</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>El total suma precios actuales por supermercado, no descuentos condicionales de billeteras o bancos.</li>
            <li>Si un super no tiene precio disponible para un item, se marca como faltante y el total queda parcial.</li>
            <li>La canasta vive en tu navegador, sin cuenta ni persistencia en base de datos.</li>
          </ul>
        </section>
      </aside>
    </div>
  );
}