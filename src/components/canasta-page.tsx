"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertCircle, ShoppingBasket } from "lucide-react";

import { BasketItemRow } from "@/components/canasta/basket-item-row";
import { BasketReceipt, SupermarketTotals } from "@/components/canasta/basket-totals";
import { buttonVariants } from "@/components/ui/button-variants";
import { useCanasta, type CanastaItem } from "@/hooks/use-canasta";
import { computeBasketPlan } from "@/lib/basket-mix";
import { pluralize } from "@/lib/format";
import { BasketCatalogUnavailableError, fetchBasketProducts } from "@/lib/basket-products-client";
import type { BasketProduct as CanastaProduct } from "@/lib/basket-products-contract";
import { cn } from "@/lib/utils";

type BasketProductData = {
  productsByEan: Record<string, CanastaProduct>;
  degradedDemo: boolean;
  loadError: string | null;
  catalogUnavailable: boolean;
  isPending: boolean;
};

function useBasketProductData(uniqueEansKey: string): BasketProductData {
  const [productsByEan, setProductsByEan] = useState<Record<string, CanastaProduct>>({});
  const [degradedDemo, setDegradedDemo] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogUnavailable, setCatalogUnavailable] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!uniqueEansKey) {
      setProductsByEan({});
      setDegradedDemo(false);
      setLoadError(null);
      setCatalogUnavailable(false);
      return;
    }

    const controller = new AbortController();
    const eans = uniqueEansKey.split("|").filter(Boolean);
    setDegradedDemo(false);
    setCatalogUnavailable(false);

    void (async () => {
      try {
        const { items: products, degraded: nextDegraded } = await fetchBasketProducts(eans, controller.signal);
        const nextProducts = Object.fromEntries(products.map((product) => [product.ean, product]));

        startTransition(() => {
          setProductsByEan(nextProducts);
          setDegradedDemo(nextDegraded);
          setLoadError(null);
          setCatalogUnavailable(false);
        });
      } catch (error) {
        if (controller.signal.aborted) return;

        if (error instanceof BasketCatalogUnavailableError) {
          setProductsByEan({});
          setDegradedDemo(false);
          setCatalogUnavailable(true);
        }
        setLoadError(error instanceof Error ? error.message : "No se pudo cargar la canasta.");
      }
    })();

    return () => controller.abort();
  }, [uniqueEansKey]);

  return { productsByEan, degradedDemo, loadError, catalogUnavailable, isPending };
}

function LoadingCanasta() {
  return (
    <div className="surface-soft flex min-h-72 items-center justify-center p-8 text-sm text-muted-foreground" role="status">
      Cargando tu canasta…
    </div>
  );
}

function EmptyCanasta() {
  return (
    <section className="surface mx-auto flex max-w-2xl flex-col items-center gap-4 p-6 text-center md:p-8">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <ShoppingBasket className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-3xl font-bold tracking-tight text-foreground">Todavía no agregaste productos</h1>
      <p className="text-base leading-7 text-muted-foreground">
        Usá la canasta para estimar el total por supermercado con los productos que venís comparando.
      </p>
      <Link href="/buscar" className={cn(buttonVariants({ size: "lg" }), "rounded-lg px-5")}>
        Explorar el catálogo
      </Link>
    </section>
  );
}

function UnavailableCanasta({ clearCanasta }: { clearCanasta: () => void }) {
  return (
    <section className="surface mx-auto flex max-w-2xl flex-col gap-3 p-6 md:p-8" role="alert">
      <AlertCircle className="size-8 text-warning" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-foreground">No podemos mostrar la canasta en este momento</h1>
      <p className="text-base leading-7 text-muted-foreground">
        El catálogo no está disponible. Conservamos tu canasta en este navegador, pero ocultamos productos y precios
        hasta que vuelva.
      </p>
      <button
        type="button"
        onClick={clearCanasta}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11 w-fit rounded-lg")}
      >
        Vaciar canasta
      </button>
    </section>
  );
}

function CanastaNotices({
  degradedDemo,
  loadError,
  unresolved,
}: {
  degradedDemo: boolean;
  loadError: string | null;
  unresolved: number;
}) {
  return (
    <>
      {loadError ? (
        <p className="border-t border-border bg-deal-soft px-4 py-3 text-sm text-foreground md:px-5">{loadError}</p>
      ) : null}
      {degradedDemo ? (
        <p role="status" className="border-t border-border bg-deal-soft px-4 py-3 text-sm text-foreground md:px-5">
          Estimaciones con precios históricos o desactualizados. No son precios actuales.
        </p>
      ) : null}
      {unresolved > 0 ? (
        <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground md:px-5">
          No pudimos cargar {pluralize(unresolved, "producto")} todavía. El comparador sigue con los demás.
        </p>
      ) : null}
    </>
  );
}

function CanastaItems({
  items, plan, productsByEan, degradedDemo, loadError, clearCanasta, removeItem, onSelect, distinctItems, totalItems,
}: {
  items: CanastaItem[];
  plan: ReturnType<typeof computeBasketPlan>;
  productsByEan: Record<string, CanastaProduct>;
  degradedDemo: boolean;
  loadError: string | null;
  clearCanasta: () => void;
  removeItem: (ean: string) => void;
  onSelect: (ean: string, slug: string) => void;
  distinctItems: number;
  totalItems: number;
}) {
  const unresolved = items.filter((item) => !productsByEan[item.ean]).length;
  return (
    <section className="surface overflow-hidden" aria-labelledby="canasta-title">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5">
        <div className="min-w-0 flex-1 basis-72">
          <h1 id="canasta-title" className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">
            Tu canasta
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pluralize(distinctItems, "producto")}, {pluralize(totalItems, "unidad", "unidades")}.{" "}
            {degradedDemo
              ? "Estimamos con precios históricos; no son precios actuales."
              : "Ajustá las cantidades y compará cuánto costaría con los últimos precios registrados."}
          </p>
        </div>
        <button
          type="button"
          onClick={clearCanasta}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "min-h-11 rounded-lg")}
        >
          Vaciar canasta
        </button>
      </div>
      <CanastaNotices degradedDemo={degradedDemo} loadError={loadError} unresolved={unresolved} />
      <div className="divide-y divide-border border-t border-border">
        {items.map((item) => (
          <BasketItemRow
            key={item.ean}
            item={item}
            product={productsByEan[item.ean]}
            planItem={plan.items.find((planItem) => planItem.ean === item.ean)!}
            degradedDemo={degradedDemo}
            removeItem={removeItem}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function CanastaCatalog({
  items, distinctItems, totalItems, clearCanasta, removeItem, data,
}: {
  items: CanastaItem[];
  distinctItems: number;
  totalItems: number;
  clearCanasta: () => void;
  removeItem: (ean: string) => void;
  data: BasketProductData;
}) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const { productsByEan, degradedDemo, loadError, isPending } = data;
  const plan = computeBasketPlan(items, productsByEan, selections, degradedDemo);

  function selectSupermarket(ean: string, slug: string) {
    setSelections((current) => ({ ...current, [ean]: slug }));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
      <CanastaItems
        items={items}
        plan={plan}
        productsByEan={productsByEan}
        degradedDemo={degradedDemo}
        loadError={loadError}
        clearCanasta={clearCanasta}
        removeItem={removeItem}
        onSelect={selectSupermarket}
        distinctItems={distinctItems}
        totalItems={totalItems}
      />
      <aside className="space-y-4 lg:sticky lg:top-20">
        <BasketReceipt plan={plan} degradedDemo={degradedDemo} />
        <SupermarketTotals
          summaries={plan.summaries}
          bestSlug={plan.bestSingle?.slug ?? null}
          degradedDemo={degradedDemo}
          isPending={isPending}
        />
        <p className="px-1 text-xs leading-5 text-muted-foreground">
          {degradedDemo
            ? "La estimación suma precios históricos o desactualizados, no precios actuales."
            : "El total suma los últimos precios registrados por supermercado; no incluye descuentos de billeteras o bancos."}{" "}
          Si un súper no tiene precio para un producto, se marca como faltante y el total queda parcial. La canasta vive
          en tu navegador, sin cuenta.
        </p>
      </aside>
    </div>
  );
}

export function CanastaPage() {
  const { clearCanasta, distinctItems, hasHydrated, items, removeItem, totalItems } = useCanasta();
  const uniqueEansKey = Array.from(new Set(items.map((item) => item.ean))).sort().join("|");
  const data = useBasketProductData(uniqueEansKey);

  if (!hasHydrated) return <LoadingCanasta />;
  if (items.length === 0) return <EmptyCanasta />;
  if (data.catalogUnavailable) return <UnavailableCanasta clearCanasta={clearCanasta} />;

  return <CanastaCatalog items={items} distinctItems={distinctItems} totalItems={totalItems} clearCanasta={clearCanasta} removeItem={removeItem} data={data} />;
}
