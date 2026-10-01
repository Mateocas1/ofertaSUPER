"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertCircle, LoaderCircle, ShoppingBasket, Trash2 } from "lucide-react";

import { BasketControls } from "@/components/basket-controls";
import { FavoriteButton } from "@/components/favorite-button";
import { PromotionBadge } from "@/components/promotion-badge";
import { StruckListPrice } from "@/components/struck-list-price";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { useCanasta, type CanastaItem } from "@/hooks/use-canasta";
import { buildBasketSummaries, computeBasketPlan, type BasketPlanItem } from "@/lib/basket-mix";
import { formatCurrency } from "@/lib/format";
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
  return <div className="surface-soft flex min-h-72 items-center justify-center p-8 text-sm text-muted-foreground">Cargando canasta local...</div>;
}

function EmptyCanasta() {
  return (
    <section className="surface p-8 md:p-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-accent-foreground"><ShoppingBasket className="size-8" /></span>
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Canasta</p>
          <h1 className="text-4xl font-extrabold text-foreground md:text-5xl">Todavia no agregaste productos.</h1>
          <p className="text-base leading-7 text-muted-foreground md:text-lg">Usa la canasta para estimar el total por supermercado con los productos que ya vienes comparando.</p>
        </div>
        <Link href="/buscar" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>Explorar catalogo</Link>
      </div>
    </section>
  );
}

function UnavailableCanasta({ clearCanasta }: { clearCanasta: () => void }) {
  return (
    <section className="surface p-8 md:p-10" role="alert">
      <div className="mx-auto flex max-w-3xl flex-col gap-5 text-center">
        <AlertCircle className="mx-auto size-10 text-warning" />
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Canasta</p>
          <h1 className="text-3xl font-semibold text-foreground md:text-4xl">No podemos mostrar los datos de la canasta en este momento.</h1>
          <p className="text-base leading-7 text-muted-foreground">El catálogo está temporalmente no disponible. Conservamos tu canasta local, pero ocultamos productos y precios hasta que vuelva a estar disponible.</p>
        </div>
        <button type="button" onClick={clearCanasta} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mx-auto rounded-full")}>Vaciar canasta</button>
      </div>
    </section>
  );
}

function BasketItemImage({ product }: { product: CanastaProduct | undefined }) {
  return <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-3/70">{product?.imageUrl ? <Image src={product.imageUrl} alt={product.name} fill sizes="80px" className="img-outline object-cover" unoptimized /> : <div className="flex h-full items-center justify-center text-xs uppercase tracking-[0.18em] text-muted-foreground">Sin foto</div>}</div>;
}

function BasketItemTitle({ item, product }: { item: CanastaItem; product: CanastaProduct | undefined }) {
  return <>
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-surface-3/70 px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">EAN {item.ean}</span><FavoriteButton ean={item.ean} productName={product?.name ?? item.ean} size="sm" /></div>
    <h2 className="mt-3 text-xl font-bold text-foreground">{product ? <Link href={`/producto/${item.ean}`} className="hover:text-primary">{product.name}</Link> : `Producto ${item.ean}`}</h2>
    <p className="mt-1 text-sm text-muted-foreground">{product?.brand ?? "Sin detalle adicional"}</p>
  </>;
}

function BasketItemPrice({ planItem, degradedDemo }: { planItem: BasketPlanItem; degradedDemo: boolean }) {
  const chosen = planItem.chosenName ? `Elegido: ${planItem.chosenName}` : "Sin precio elegible";
  return <p className="mt-3 text-sm text-muted-foreground">{chosen}: <strong className="tabular-nums text-foreground">{formatCurrency(planItem.lineTotal)}</strong>{degradedDemo ? " (estimación histórica)" : ""}</p>;
}

function BasketItemIdentity({ item, product, planItem, degradedDemo }: { item: CanastaItem; product: CanastaProduct | undefined; planItem: BasketPlanItem; degradedDemo: boolean }) {
  return <div className="flex min-w-0 gap-4">
    <BasketItemImage product={product} />
    <div className="min-w-0"><BasketItemTitle item={item} product={product} /><BasketItemPrice planItem={planItem} degradedDemo={degradedDemo} /></div>
  </div>;
}

function BasketProductBadges({ item, product }: { item: CanastaItem; product: CanastaProduct | undefined }) {
  if (!product) return <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-warning/50 bg-deal-soft px-3 py-2 text-sm text-foreground"><AlertCircle className="size-4" />Sin detalle cargado por ahora</div>;
  const visibleEntries = product.priceEntries.slice(0, 4);
  return <div className="mt-4 flex flex-wrap items-center gap-2">
    {visibleEntries.map((entry) => <SupermarketBadge key={`${item.ean}-${entry.supermarket.slug}`} name={entry.supermarket.name} slug={entry.supermarket.slug} logoUrl={entry.supermarket.logoUrl} price={entry.isAvailable ? formatCurrency(entry.price) : "No disp."} />)}
    {visibleEntries.filter((entry) => entry.isAvailable && entry.promo).map((entry) => <PromotionBadge key={`${item.ean}-${entry.supermarket.slug}-promo`} type={entry.promo!.type === "nth-unit" ? "2nd_50" : "percentage"} label={entry.promo!.label} />)}
    {visibleEntries.filter((entry) => entry.isAvailable).map((entry) => <StruckListPrice key={`${item.ean}-${entry.supermarket.slug}-list`} price={entry.price} listPrice={entry.listPrice} />)}
  </div>;
}

function BasketSuperSelector({ planItem, onSelect }: { planItem: BasketPlanItem; onSelect: (ean: string, slug: string) => void }) {
  if (planItem.options.length === 0) {
    return <p className="mt-3 text-sm text-muted-foreground">Sin precio elegible para este producto todavia.</p>;
  }
  return <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
    <span className="sr-only">Supermercado para {planItem.ean}</span>
    <span>Súper</span>
    <select
      value={planItem.chosenSlug ?? ""}
      onChange={(event) => onSelect(planItem.ean, event.target.value)}
      className="min-h-11 rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground"
    >
      {planItem.options.map((option) => (
        <option key={option.slug} value={option.slug}>{option.name} — {formatCurrency(option.price)}</option>
      ))}
    </select>
  </label>;
}

function BasketItemCard({ item, product, planItem, degradedDemo, removeItem, onSelect }: { item: CanastaItem; product: CanastaProduct | undefined; planItem: BasketPlanItem; degradedDemo: boolean; removeItem: (ean: string) => void; onSelect: (ean: string, slug: string) => void }) {
  return <article className="surface-soft p-5">
    <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
      <BasketItemIdentity item={item} product={product} planItem={planItem} degradedDemo={degradedDemo} />
      <div className="flex flex-wrap items-center gap-3">
        <BasketControls ean={item.ean} productName={product?.name ?? item.ean} />
        <button type="button" onClick={() => removeItem(item.ean)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-full text-muted-foreground")} aria-label={`Eliminar ${product?.name ?? item.ean} de la canasta`}><Trash2 className="size-4" />Quitar</button>
      </div>
    </div>
    <BasketSuperSelector planItem={planItem} onSelect={onSelect} />
    <BasketProductBadges item={item} product={product} />
  </article>;
}

function BasketMixCard({ plan, degradedDemo }: { plan: ReturnType<typeof computeBasketPlan>; degradedDemo: boolean }) {
  const { bestSingle, savings } = plan;
  return (
    <section className="surface p-6 md:p-8">
      <div><p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Mezcla automática</p><h2 className="mt-2 text-3xl font-bold text-foreground">Cada producto en su súper más barato</h2></div>
      <p className="price mt-5 text-4xl text-foreground">{formatCurrency(plan.mixedTotal)}</p>
      {savings !== null && bestSingle ? (
        <p className="mt-3 text-sm font-medium tabular-nums text-primary">Ahorás {formatCurrency(savings)} frente a la mejor canasta en un solo súper ({formatCurrency(bestSingle.total)} en {bestSingle.name}).</p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">La mezcla esta incompleta: {plan.mixedMissing} producto(s) sin precio elegible todavia.</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Cambiá el súper de cada producto en su tarjeta; la mezcla respeta tu elección.</p>
      {degradedDemo ? <p className="mt-2 text-xs text-warning">Estimación histórica: los valores pueden estar desactualizados.</p> : null}
    </section>
  );
}

function BasketSummaryCard({ summary, isBest, degradedDemo }: { summary: ReturnType<typeof buildBasketSummaries>[number]; isBest: boolean; degradedDemo: boolean }) {
  return (
    <article className={cn("rounded-xl border p-5", isBest ? "settle border-primary bg-accent shadow-[var(--elevation-2)]" : "border-border/70 bg-surface-1")}>
      <div className="flex items-center justify-between gap-4"><SupermarketBadge name={summary.name} slug={summary.slug} logoUrl={summary.logoUrl} />{isBest ? <span className="price-tag font-sans">{degradedDemo ? "Mejor estimación completa" : "Mejor canasta completa"}</span> : null}</div>
      <p className="price mt-5 text-4xl text-foreground">{formatCurrency(summary.total)}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground"><span>{summary.coveredItems} items cubiertos</span><span>•</span><span>{summary.missingItems} faltantes</span></div>
    </article>
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
  const { summaries, bestSingle } = plan;
  const unresolvedItems = items.filter((item) => !productsByEan[item.ean]);

  function selectSupermarket(ean: string, slug: string) {
    setSelections((current) => ({ ...current, [ean]: slug }));
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
      <section className="space-y-5">
        <div className="surface p-6 md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Canasta activa</p>
              <h1 className="mt-2 text-4xl font-extrabold text-foreground md:text-5xl">{distinctItems} productos, {totalItems} unidades</h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">{degradedDemo ? "Esta demostración estima la canasta con precios históricos; no muestra precios actuales." : "Ajusta cantidades y compara cuanto costaría resolver la canasta con registros recientes disponibles por supermercado."}</p>
            </div>
            <button type="button" onClick={clearCanasta} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}>Vaciar canasta</button>
          </div>
          {loadError ? <p className="mt-5 rounded-xl border-2 border-dashed border-warning/60 bg-deal-soft px-4 py-3 text-sm text-foreground">{loadError}</p> : null}
          {degradedDemo ? <p role="status" className="mt-5 rounded-xl border-2 border-dashed border-warning/60 bg-deal-soft px-4 py-3 text-sm text-foreground">Estimaciones de demostración con precios históricos o desactualizados. No son precios actuales.</p> : null}
          {unresolvedItems.length > 0 ? <p className="mt-5 rounded-xl bg-surface-3/70 px-4 py-3 text-sm text-muted-foreground">{unresolvedItems.length} producto(s) todavia no pudieron resolverse desde la API. El comparador sigue calculando con los items cargados.</p> : null}
        </div>

        <div className="space-y-4">
          {items.map((item) => <BasketItemCard key={item.ean} item={item} product={productsByEan[item.ean]} planItem={plan.items.find((planItem) => planItem.ean === item.ean)!} degradedDemo={degradedDemo} removeItem={removeItem} onSelect={selectSupermarket} />)}
        </div>
      </section>

      <aside className="space-y-5">
        <BasketMixCard plan={plan} degradedDemo={degradedDemo} />
        <section className="surface p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Comparativa</p><h2 className="mt-2 text-3xl font-bold text-foreground">{degradedDemo ? "Estimación histórica por supermercado" : "Total por supermercado"}</h2></div>
            {isPending ? <LoaderCircle className="size-5 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="mt-6 space-y-4">
            {summaries.map((summary) => <BasketSummaryCard key={summary.slug} summary={summary} isBest={bestSingle?.slug === summary.slug} degradedDemo={degradedDemo} />)}
            {summaries.length === 0 ? <div className="rounded-xl border-2 border-dashed border-border bg-surface-1 p-5 text-sm text-muted-foreground">Aun no hay suficiente cobertura multi-super para calcular un total agregado.</div> : null}
          </div>
        </section>
        <section className="surface-soft p-6">
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Lectura rapida</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground"><li>{degradedDemo ? "La estimación de demostración suma precios históricos o desactualizados conocidos, no precios actuales." : "El total suma registros recientes por supermercado, no descuentos condicionales de billeteras o bancos."}</li><li>Si un super no tiene precio disponible para un item, se marca como faltante y el total queda parcial.</li><li>La canasta vive en tu navegador, sin cuenta ni persistencia en base de datos.</li></ul>
        </section>
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
