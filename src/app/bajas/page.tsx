import type { Metadata } from "next";
import Link from "next/link";

import { ProductThumb } from "@/components/product-thumb";
import { DropsFilter, type DropFilterCategory, type DropFilterRow } from "@/components/bajas/drops-filter";
import { formatDate, formatDiscountPercent } from "@/lib/format";
import {
  buildPriceDropsView,
  formatDropAmount,
  loadPriceDrops,
  storeLabel,
  type PriceDrop,
  type PriceDropsView,
} from "@/lib/price-drops";
import { PRICE_DROPS_FEED_PATH, PRICE_DROPS_FEED_TITLE } from "@/lib/price-drops-feed";
import { canonicalProductPath, createMetadata } from "@/lib/seo/metadata";

// Server-rendered from the committed data/price-drops.json the daily refresh
// publishes: the page never queries a store, never invents a movement and shows
// an explicit state when the payload is empty or missing.

export const revalidate = 21600;

export const metadata: Metadata = createMetadata({
  title: "Bajas de precio",
  description:
    "Bajas de precio del catálogo: cuánto cayó cada oferta contra su observación anterior, en qué supermercado y cuándo se registró cada precio.",
  path: "/bajas",
  feeds: [{ path: PRICE_DROPS_FEED_PATH, title: PRICE_DROPS_FEED_TITLE }],
});

function loadView(): PriceDropsView {
  try {
    return buildPriceDropsView(loadPriceDrops());
  } catch {
    return buildPriceDropsView(null);
  }
}

function DropRow({ drop }: { drop: PriceDrop }) {
  return (
    <article className="flex items-center gap-3 px-4 py-3 sm:gap-4 md:px-5">
      <ProductThumb src={drop.imageUrl} />
      <div className="grid min-w-0 flex-1 gap-x-4 gap-y-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-foreground md:text-base">
            <Link
              href={canonicalProductPath(drop.ean)}
              className="line-clamp-2 after:absolute after:inset-0 hover:text-primary focus-visible:outline-none focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
            >
              {drop.name}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {drop.brand ?? "Sin marca"} · {drop.category ?? "Sin categoría"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {storeLabel(drop.source)} · <time dateTime={drop.observedAt}>{formatDate(drop.observedAt)}</time>
          </p>
        </div>
        <div className="flex items-baseline gap-3 md:flex-col md:items-end md:gap-0.5">
          <p className="price text-base text-primary">
            <span className="text-xs font-normal text-muted-foreground">Bajó </span>
            {formatDiscountPercent(drop.percentDrop, 1)}
          </p>
          <p className="text-sm tabular-nums text-muted-foreground">
            <span className="sr-only">Antes </span>
            <span className="line-through">{formatDropAmount(drop.previousPrice)}</span>
            <span aria-hidden="true"> → </span>
            <span className="sr-only">, ahora </span>
            <span className="price text-foreground">{formatDropAmount(drop.currentPrice)}</span>
          </p>
        </div>
      </div>
    </article>
  );
}

function dropSummary(view: PriceDropsView): string {
  const payload = view.payload;
  if (!payload) return view.summary;
  const day = formatDate(`${payload.date}T12:00:00`);
  if (payload.drops.length === 0) return `En el relevamiento del ${day} no hubo bajas por encima de los umbrales.`;
  const total = payload.totalDrops;
  const verb = total === 1 ? "precio bajó" : "precios bajaron";
  const shown =
    payload.drops.length < total
      ? `; mostramos ${payload.drops.length === 1 ? "la mayor" : `las ${payload.drops.length} mayores`}`
      : "";
  return `${total} ${verb} en el relevamiento del ${day}${shown}.`;
}

function Header({ view }: { view: PriceDropsView }) {
  return (
    <header aria-labelledby="price-drops-title">
      <h1 id="price-drops-title" className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        Bajas de precio
      </h1>
      <p className="mt-2 text-base text-muted-foreground">{dropSummary(view)}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
        <Link
          href="/metodologia#umbrales-de-bajas"
          className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground"
        >
          Cómo elegimos qué baja se publica
        </Link>
        <a
          href={PRICE_DROPS_FEED_PATH}
          type="application/atom+xml"
          className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground"
        >
          Suscribirse al feed Atom
        </a>
      </p>
    </header>
  );
}

function UnavailableState({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-4 md:p-5" aria-labelledby="price-drops-unavailable">
      <h2 id="price-drops-unavailable" className="text-xl font-semibold text-foreground">
        Bajas no disponibles
      </h2>
      <p className="mt-2 max-w-prose text-base text-muted-foreground" role="alert">
        {view.summary}
      </p>
    </section>
  );
}

function EmptyState({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-4 md:p-5" aria-labelledby="price-drops-empty">
      <h2 id="price-drops-empty" className="text-xl font-semibold text-foreground">
        Sin bajas por encima de los umbrales
      </h2>
      <p className="mt-2 max-w-prose text-base text-muted-foreground">{dropSummary(view)}</p>
    </section>
  );
}

function categoryCounts(drops: PriceDrop[]): DropFilterCategory[] {
  const counts = new Map<string, number>();
  for (const drop of drops) {
    const name = drop.category ?? "Sin categoría";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es-AR"));
}

function DropList({ view }: { view: PriceDropsView }) {
  const rows: DropFilterRow[] = view.drops.map((drop) => ({
    id: `${drop.ean}:${drop.source}:${drop.date}`,
    category: drop.category,
    node: <DropRow drop={drop} />,
  }));

  return <DropsFilter rows={rows} categories={categoryCounts(view.drops)} />;
}

export default function PriceDropsPage() {
  const view = loadView();

  return (
    <div className="container-page flex flex-col gap-6 py-8 md:py-10">
      <Header view={view} />
      {view.unavailable ? <UnavailableState view={view} /> : null}
      {!view.unavailable && view.isEmpty ? <EmptyState view={view} /> : null}
      {!view.unavailable && !view.isEmpty ? <DropList view={view} /> : null}
      <p className="max-w-prose text-xs text-muted-foreground">
        Los precios son observaciones registradas del catálogo; fijate en la fecha de cada una antes de decidir una
        compra.
      </p>
    </div>
  );
}
