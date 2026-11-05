import type { Metadata } from "next";
import Link from "next/link";

import { BasketIndexChart } from "@/components/basket-index-chart";
import {
  BasketIndexUnavailableError,
  buildBasketIndexView,
  formatMonthLabel,
  formatNumber,
  loadBasketIndex,
  type BasketIndexMover,
  type BasketIndexPayload,
  type BasketIndexView,
} from "@/lib/analytics/basket-index";
import { formatSignedPercent } from "@/lib/format";
import { createMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = createMetadata({
  title: "Inflación por producto",
  description:
    "Índice de canasta propio (Laspeyres) comparado con el IPC del INDEC, con la variación por producto y la cobertura real de la serie.",
  path: "/inflacion",
});

const ISO_DATE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(`${isoDate}T12:00:00`),
  );
}

/** The payload notes carry raw ISO dates; readers get "4 nov 2026". */
function humanizeDates(text: string): string {
  return text.replace(ISO_DATE, (match) => formatLongDate(match));
}

function UnavailablePage() {
  return (
    <div className="container-page py-8 md:py-10">
      <section className="surface p-4 md:p-5" aria-labelledby="basket-index-unavailable">
        <h1 id="basket-index-unavailable" className="text-2xl font-semibold text-foreground">
          Índice de canasta no disponible
        </h1>
        <p className="mt-2 max-w-prose text-base text-muted-foreground" role="alert">
          La serie de la canasta falta o está dañada. No mostramos valores estimados.
        </p>
      </section>
    </div>
  );
}

function StatStrip({ stats }: { stats: BasketIndexView["stats"] }) {
  return (
    <dl className="surface grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x">
      {stats.map((stat, index) => (
        <div key={stat.label} className={`p-4 md:p-5 ${index >= 2 ? "border-t border-border lg:border-t-0" : ""} ${index % 2 === 1 ? "border-l border-border lg:border-l-0" : ""}`}>
          <dt className="text-xs text-muted-foreground">{stat.label}</dt>
          <dd className="price mt-1 text-3xl text-foreground">{stat.value}</dd>
          <dd className="mt-1 text-sm text-muted-foreground">{stat.detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function InsufficientSeries({ view }: { view: BasketIndexView }) {
  return (
    <section className="surface p-4 md:p-5" aria-labelledby="basket-index-empty">
      <h2 id="basket-index-empty" className="text-xl font-semibold text-foreground">
        Sin datos suficientes para publicar un índice
      </h2>
      <p className="mt-2 max-w-[70ch] text-base leading-7 text-muted-foreground">{humanizeDates(view.statusNote)}</p>
      <p className="mt-2 max-w-[70ch] text-base leading-7 text-muted-foreground">
        No mostramos valores estimados ni de muestra mientras falte esa ventana.
      </p>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-base text-muted-foreground">
        <li>Al menos {view.requirements.minimumBasketMonths} meses completos de canasta.</li>
        <li>Un mes de IPC del INDEC superpuesto (último publicado: {view.cpiMonthLabel}).</li>
      </ul>
      <p className="mt-4 max-w-[70ch] text-sm text-muted-foreground">
        Cuando se cumplan, acá vas a ver el índice de canasta, la comparación mensual contra el IPC y los mayores
        movimientos por producto.
      </p>
    </section>
  );
}

function MoversList({ title, movers }: { title: string; movers: BasketIndexMover[] }) {
  return (
    <section aria-label={title} className="p-4 md:p-5">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {movers.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Sin movimientos suficientes en la ventana.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {movers.map((mover) => (
            <li key={`${mover.gtin14}-${mover.store}`} className="flex items-baseline justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{mover.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {mover.category ?? "Sin categoría"} · {mover.store}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="price text-sm text-foreground">{formatSignedPercent(mover.change_pct, 1)}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {formatNumber(mover.first_price)} → {formatNumber(mover.last_price)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ComparisonTable({ payload }: { payload: BasketIndexPayload }) {
  return (
    <section className="surface overflow-hidden" aria-labelledby="basket-vs-cpi-table">
      <div className="border-b border-border p-4 md:p-5">
        <h2 id="basket-vs-cpi-table" className="text-xl font-semibold text-foreground">
          Canasta vs IPC, mes a mes
        </h2>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          {humanizeDates(payload.comparison.note)} El IPC se lleva a la base de la canasta para compartir eje.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs font-medium text-muted-foreground">
              <th className="px-4 py-3 font-medium md:px-5">Mes</th>
              <th className="px-4 py-3 font-medium">Canasta</th>
              <th className="px-4 py-3 font-medium">Variación canasta</th>
              <th className="px-4 py-3 font-medium">IPC (base común)</th>
              <th className="px-4 py-3 font-medium">Variación IPC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-t border-border">
            {payload.basketMonthly.map((row) => (
              <tr key={row.month}>
                <td className="px-4 py-3 text-foreground md:px-5">{formatMonthLabel(row.month)}</td>
                <td className="px-4 py-3 text-foreground">{formatNumber(row.index)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatSignedPercent(row.changePct, 1)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatNumber(row.cpiRebasedIndex)}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatSignedPercent(row.cpiChangePct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReadySeries({ view, payload }: { view: BasketIndexView; payload: BasketIndexPayload }) {
  return (
    <>
      <StatStrip stats={view.stats} />

      <section className="surface p-4 md:p-5" aria-labelledby="basket-vs-cpi">
        <h2 id="basket-vs-cpi" className="text-xl font-semibold text-foreground">
          Canasta vs IPC
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Serie diaria del índice contra el IPC mensual llevado a la misma base.{" "}
          <Link href="/metodologia" className="underline underline-offset-2 hover:text-foreground">
            Cómo se calcula
          </Link>
        </p>
        <div className="mt-4">
          <BasketIndexChart points={view.chartPoints} />
        </div>
      </section>

      <ComparisonTable payload={payload} />

      <div className="surface grid divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <MoversList title="Mayores subas" movers={payload.topRisers} />
        <MoversList title="Mayores bajas" movers={payload.topFallers} />
      </div>
    </>
  );
}

function BasketComposition({ payload }: { payload: BasketIndexPayload }) {
  return (
    <section className="surface p-4 md:p-5" aria-labelledby="basket-composition">
      <h2 id="basket-composition" className="text-xl font-semibold text-foreground">
        Canasta fija
      </h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        Peso de cada producto en el índice. Se recalculan con los productos que tienen precio reciente en cada fecha.
      </p>
      <ul className="mt-3 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {payload.basketWeights.map((item) => (
          <li key={item.gtin14} className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-foreground">{item.label}</span>
              <span className="block text-xs text-muted-foreground">{item.category ?? "Sin categoría"}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(item.weight * 100)}%</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MethodNotes({ view, payload }: { view: BasketIndexView; payload: BasketIndexPayload }) {
  return (
    <section className="max-w-[70ch]" aria-labelledby="basket-method">
      <h2 id="basket-method" className="text-xl font-semibold text-foreground">
        Qué tener en cuenta
      </h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-muted-foreground">
        <li>
          El índice promedia el precio de cada producto entre los supermercados relevados; no pondera por participación
          de mercado.
        </li>
        <li>La canasta es fija, no una canasta de consumo representativa del hogar.</li>
        <li>
          Fuente del IPC: {payload.cpi.source}. Último mes publicado: {view.cpiMonthLabel}.{" "}
          {view.cpiSourceUrl && (
            <a href={view.cpiSourceUrl} className="underline underline-offset-2" rel="noreferrer">
              Ver la serie oficial
            </a>
          )}
        </li>
        <li>
          Más detalle en{" "}
          <Link href="/metodologia" className="underline underline-offset-2">
            la metodología
          </Link>
          .
        </li>
      </ul>
    </section>
  );
}

export default function InflationPage() {
  let payload: BasketIndexPayload;
  try {
    payload = loadBasketIndex();
  } catch (error) {
    if (error instanceof BasketIndexUnavailableError) return <UnavailablePage />;
    throw error;
  }

  const view = buildBasketIndexView(payload);

  return (
    <div className="container-page flex flex-col gap-6 py-8 md:py-10">
      <header className="max-w-[70ch]">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Inflación por producto</h1>
        <p className="mt-2 text-base leading-7 text-muted-foreground">
          Un índice propio de canasta fija, calculado sobre los precios registrados y comparado con el IPC Nivel General
          del INDEC.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {humanizeDates(view.summary)} Calculado el {formatLongDate(payload.generatedAt.slice(0, 10))}.
        </p>
      </header>

      {view.isSample && (
        <p className="surface-soft max-w-[70ch] px-4 py-3 text-sm text-foreground" role="note">
          Serie de muestra: estos números provienen del conjunto de datos de prueba. La serie real se publica con la
          actualización diaria del catálogo.
        </p>
      )}

      {view.isEmpty ? <InsufficientSeries view={view} /> : <ReadySeries view={view} payload={payload} />}

      <BasketComposition payload={payload} />
      <MethodNotes view={view} payload={payload} />
    </div>
  );
}
