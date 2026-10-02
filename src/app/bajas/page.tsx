import type { Metadata } from "next";
import Link from "next/link";

import { formatDateTime } from "@/lib/format";
import {
  buildPriceDropsView,
  formatDropAmount,
  formatDropPercent,
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
    <article className="grid gap-3 border-b-2 border-dashed border-border py-4 last:border-b-0 md:grid-cols-[1.7fr_0.8fr_1fr_0.7fr_0.6fr] md:items-center md:gap-4">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-foreground">{drop.name}</h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {drop.brand ?? "Sin marca"} · {drop.category ?? "Sin categoría"}
        </p>
      </div>
      <p className="text-sm font-medium text-foreground">{storeLabel(drop.source)}</p>
      <p className="font-mono text-xs tabular-nums text-muted-foreground">
        <span className="line-through">{formatDropAmount(drop.previousPrice)}</span>
        <span aria-hidden="true"> → </span>
        <span className="text-foreground">{formatDropAmount(drop.currentPrice)}</span>
      </p>
      <p className="price text-xl text-primary">-{formatDropPercent(drop.percentDrop)}</p>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <time dateTime={drop.observedAt}>{formatDateTime(drop.observedAt)}</time>
        <Link
          href={canonicalProductPath(drop.ean)}
          className="inline-flex min-h-11 w-fit items-center font-semibold text-primary hover:underline"
        >
          Ver producto
        </Link>
      </div>
    </article>
  );
}

function Header({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-6 sm:p-8 lg:p-10" aria-labelledby="price-drops-title">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Precios registrados</p>
      <h1 id="price-drops-title" className="mt-2 text-3xl font-bold tracking-[-0.03em] text-foreground sm:text-4xl">
        Bajas de precio
      </h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
        Todos los días comparamos el precio de cada oferta contra su última observación distinta y publicamos las
        caídas que superan los umbrales. Cada línea muestra el precio anterior, el más reciente y la fecha de cada
        registro, con el supermercado que lo publicó.
      </p>
      <p className="mt-3 max-w-3xl text-base leading-7 text-foreground">{view.summary}</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">{view.thresholdsNote}</p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link
          href="/ofertas"
          className="press inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Ver ofertas disponibles
        </Link>
        <a
          href={PRICE_DROPS_FEED_PATH}
          type="application/atom+xml"
          className="press inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:border-primary hover:text-primary"
        >
          Suscribirse al feed Atom
        </a>
      </div>
    </section>
  );
}

function UnavailableState({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-6 sm:p-8" aria-labelledby="price-drops-unavailable">
      <h2 id="price-drops-unavailable" className="text-2xl font-bold tracking-[-0.03em] text-foreground">
        Bajas no disponibles
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground" role="alert">
        {view.summary}
      </p>
    </section>
  );
}

function EmptyState({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-6 sm:p-8" aria-labelledby="price-drops-empty">
      <h2 id="price-drops-empty" className="text-2xl font-bold tracking-[-0.03em] text-foreground">
        Sin bajas por encima de los umbrales
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{view.summary}</p>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
        Una caída menor a los umbrales no se publica para no mostrar movimientos que el visitante no puede aprovechar.
      </p>
    </section>
  );
}

function DropList({ view }: { view: PriceDropsView }) {
  return (
    <section className="surface p-6 sm:p-8" aria-labelledby="price-drops-list">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="price-drops-list" className="text-2xl font-bold tracking-[-0.03em] text-foreground">
          {view.drops.length === 1 ? "1 baja publicada" : `${view.drops.length} bajas publicadas`}
        </h2>
        <p className="text-xs text-muted-foreground">
          Ordenadas por variación porcentual; se publican hasta {view.payload?.rules.limit ?? 0} por día.
        </p>
      </div>
      <div className="mt-2">
        {view.drops.map((drop) => (
          <DropRow key={`${drop.ean}:${drop.source}:${drop.date}`} drop={drop} />
        ))}
      </div>
    </section>
  );
}

export default function PriceDropsPage() {
  const view = loadView();

  return (
    <div className="px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Header view={view} />
        {view.unavailable ? <UnavailableState view={view} /> : null}
        {!view.unavailable && view.isEmpty ? <EmptyState view={view} /> : null}
        {!view.unavailable && !view.isEmpty ? <DropList view={view} /> : null}
        <p className="text-xs leading-5 text-muted-foreground">
          Los precios son observaciones registradas por el refresh diario del catálogo; compará siempre la fecha de
          cada registro antes de decidir una compra.
        </p>
      </div>
    </div>
  );
}
