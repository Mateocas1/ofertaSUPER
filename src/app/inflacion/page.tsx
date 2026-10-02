import type { Metadata } from "next";
import Link from "next/link";

import { BasketIndexChart } from "@/components/basket-index-chart";
import {
  BasketIndexUnavailableError,
  buildBasketIndexView,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  loadBasketIndex,
  type BasketIndexMover,
  type BasketIndexPayload,
} from "@/lib/analytics/basket-index";
import { createMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = createMetadata({
  title: "Inflación por producto",
  description:
    "Índice de canasta propio (Laspeyres) comparado con el IPC del INDEC, con la variación por producto y la cobertura real de la serie.",
  path: "/inflacion",
});

function UnavailablePage() {
  return (
    <div className="px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto w-full max-w-7xl">
        <section className="surface p-8 md:p-10" aria-labelledby="basket-index-unavailable">
          <h1 id="basket-index-unavailable" className="text-3xl font-semibold text-foreground">
            Índice de canasta no disponible
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground" role="alert">
            La serie precalculada falta o está corrupta. No se muestran valores estimados.
          </p>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="surface-soft p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </article>
  );
}

function MoversTable({ title, movers, tone }: { title: string; movers: BasketIndexMover[]; tone: "rise" | "fall" }) {
  return (
    <div className="surface p-5 sm:p-6">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      {movers.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Sin movimientos suficientes en la ventana.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {movers.map((mover) => (
            <li key={`${mover.gtin14}-${mover.store}`} className="flex items-baseline justify-between gap-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{mover.product_name}</p>
                <p className="text-xs text-muted-foreground">
                  {mover.category ?? "Sin categoría"} · {mover.store}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={tone === "rise" ? "text-sm font-semibold text-foreground" : "text-sm font-semibold text-foreground"}>
                  {formatPercent(mover.change_pct)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(mover.first_price)} → {formatNumber(mover.last_price)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComparisonTable({ payload }: { payload: BasketIndexPayload }) {
  return (
    <div className="surface overflow-hidden">
      <div className="border-b border-border p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">Canasta vs IPC, mes a mes</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {payload.comparison.note} El IPC se rebaja al mes base de la canasta para compartir eje.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="bg-surface-2 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Mes</th>
              <th className="px-5 py-3 font-semibold">Canasta</th>
              <th className="px-5 py-3 font-semibold">Var. canasta</th>
              <th className="px-5 py-3 font-semibold">IPC (base común)</th>
              <th className="px-5 py-3 font-semibold">Var. IPC</th>
            </tr>
          </thead>
          <tbody>
            {payload.basketMonthly.map((row) => (
              <tr key={row.month} className="border-t border-border">
                <td className="px-5 py-3 text-foreground">{formatMonthLabel(row.month)}</td>
                <td className="px-5 py-3 text-foreground">{formatNumber(row.index)}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatPercent(row.changePct)}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatNumber(row.cpiRebasedIndex)}</td>
                <td className="px-5 py-3 text-muted-foreground">{formatPercent(row.cpiChangePct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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
    <div className="px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="surface overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Datos abiertos</p>
              <h1 className="mt-3 max-w-4xl text-4xl font-extrabold leading-[0.98] tracking-[-0.045em] text-foreground text-balance sm:text-5xl">
                Inflación por producto
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                Un índice de canasta fija propio (Laspeyres) calculado sobre los precios observados, comparado con el IPC
                Nivel General del INDEC.
              </p>
            </div>
            <div className="rounded-xl bg-surface-2 p-4 text-sm leading-6 text-muted-foreground ring-1 ring-border">
              <p>{view.summary}</p>
              <p className="mt-2">
                Generado el {payload.generatedAt.slice(0, 10)} con el método: {payload.method}.
              </p>
            </div>
          </div>
        </section>

        {view.isSample && (
          <section className="rounded-xl border-2 border-dashed border-primary/40 bg-accent/60 p-4 text-sm leading-6 text-foreground" role="note">
            Serie de muestra: estos números provienen del dataset que usa la integración continua. La serie real se publica
            con el refresh diario del catálogo.
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {view.stats.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} detail={stat.detail} />
          ))}
        </section>

        <section className="surface p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">Canasta vs IPC</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Serie diaria del índice contra el IPC mensual rebajado a la misma base.
              </p>
            </div>
            <Link
              href="/metodologia"
              className="press inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Cómo se calcula
            </Link>
          </div>
          <BasketIndexChart points={view.chartPoints} />
        </section>

        <ComparisonTable payload={payload} />

        <section className="grid gap-5 lg:grid-cols-2">
          <MoversTable title="Mayores subas" movers={payload.topRisers} tone="rise" />
          <MoversTable title="Mayores bajas" movers={payload.topFallers} tone="fall" />
        </section>

        <section className="surface-soft p-5 sm:p-6" aria-labelledby="basket-composition">
          <h2 id="basket-composition" className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Canasta fija
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pesos del índice. Se renormalizan sobre los productos con precio fresco en cada fecha.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {payload.basketWeights.map((item) => (
              <li key={item.gtin14} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm ring-1 ring-border">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.category ?? "Sin categoría"}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{(item.weight * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="surface p-5 sm:p-6" aria-labelledby="basket-method">
          <h2 id="basket-method" className="text-xl font-semibold tracking-[-0.02em] text-foreground">Notas de método</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            <li>
              El índice promedia el precio de cada producto entre los supermercados relevados; no pondera por participación
              de mercado.
            </li>
            <li>La canasta es fija (semilla de pesos), no una canasta de consumo representativa del hogar.</li>
            <li>
              Fuente del IPC: {payload.cpi.source}. Último mes publicado: {view.cpiMonthLabel}.{" "}
              {view.cpiSourceUrl && (
                <a href={view.cpiSourceUrl} className="underline underline-offset-2" rel="noreferrer">
                  Ver la serie oficial
                </a>
              )}
            </li>
            <li>El método completo y las ponderaciones viven en el proyecto de análisis; esta página solo renderiza el JSON precalculado.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
