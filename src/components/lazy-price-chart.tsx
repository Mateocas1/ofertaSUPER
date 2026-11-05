"use client";

import dynamic from "next/dynamic";

// recharts only ships to the browser once the chart is needed; the placeholder
// keeps the section's height so nothing below it jumps when it loads.
const PriceChart = dynamic(() => import("@/components/price-chart").then((module) => module.PriceChart), {
  ssr: false,
  loading: () => (
    <section className="surface flex flex-col gap-4 p-4 md:p-5" aria-busy="true" aria-label="Historial de precio">
      <h2 className="text-lg font-semibold text-foreground">Historial de precio</h2>
      <div className="flex h-72 items-center justify-center rounded-lg bg-surface-1 text-sm text-muted-foreground md:h-80">
        Cargando el gráfico…
      </div>
    </section>
  ),
});

export { PriceChart as LazyPriceChart };
