"use client";

import dynamic from "next/dynamic";

const PriceChart = dynamic(() => import("@/components/price-chart").then((module) => module.PriceChart), {
  ssr: false,
  loading: () => (
    <div className="surface-soft flex min-h-72 items-center justify-center p-6 text-sm text-muted-foreground">
      Cargando grafico...
    </div>
  ),
});

export { PriceChart as LazyPriceChart };
