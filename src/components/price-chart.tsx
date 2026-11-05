"use client";

import { useEffect, useState } from "react";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PriceHistoryTable } from "@/components/product/price-history-table";
import { SUPERMARKET_SERIES_COLORS, UNKNOWN_SERIES_COLOR } from "@/components/product/series-palette";
import {
  dayTicks,
  formatAxisDay,
  formatLongDay,
  observedPrices,
  priceAxis,
  timeDomain,
  toTimePoints,
  type TimePoint,
} from "@/components/product/price-history-model";
import { formatCurrency, pluralize } from "@/lib/format";

type Series = { slug: string; name: string; color: string };

type PriceChartProps = {
  data: {
    days?: number;
    series: Series[];
    points: Array<Record<string, number | string | null>>;
  };
};

const CHART_HEIGHT_CLASS = "h-72 md:h-80";
const DOTS_UP_TO_DAYS = 31;

function cssToken(slug: string) {
  return `--series-${slug.replace(/[^a-z0-9-]/gi, "")}`;
}

function seriesStroke(slug: string) {
  return `var(${cssToken(slug)}, var(--series-unknown))`;
}

// Each theme gets its own validated step (see series-palette.ts), following
// the same dark-mode switch as globals.css: the `.dark` class, or the OS
// setting unless `.light` forces light.
function paletteCss(mode: "light" | "dark") {
  const tokens = Object.entries(SUPERMARKET_SERIES_COLORS).map(([slug, color]) => `${cssToken(slug)}:${color[mode]};`);
  return `${tokens.join("")}--series-unknown:${UNKNOWN_SERIES_COLOR[mode]};`;
}

const PALETTE_CSS = [
  `.price-history{${paletteCss("light")}}`,
  `.dark .price-history{${paletteCss("dark")}}`,
  `@media (prefers-color-scheme: dark){:root:not(.light) .price-history{${paletteCss("dark")}}}`,
].join("");

function LineKey({ slug }: { slug: string }) {
  return (
    <svg width="16" height="8" aria-hidden="true" className="shrink-0">
      <line x1="1" y1="4" x2="15" y2="4" stroke={seriesStroke(slug)} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChartLegend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-foreground" aria-label="Supermercados del gráfico">
      {series.map((serie) => (
        <li key={serie.slug} className="flex items-center gap-1.5">
          <LineKey slug={serie.slug} />
          {serie.name}
        </li>
      ))}
    </ul>
  );
}

type TooltipContentProps = {
  active?: boolean;
  label?: number | string;
  payload?: ReadonlyArray<{ payload?: TimePoint }>;
  series: Series[];
};

function ChartTooltip({ active, payload, series }: TooltipContentProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="mb-1 text-xs text-muted-foreground">{formatLongDay(row.t)}</p>
      <ul className="flex flex-col gap-0.5">
        {series.map((serie) => (
          <li key={serie.slug} className="flex items-center gap-2">
            <LineKey slug={serie.slug} />
            <span className="price font-semibold">{row[serie.slug] === null ? "Sin precio" : formatCurrency(row[serie.slug])}</span>
            <span className="text-muted-foreground">{serie.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function seriesSubject(series: Series[]) {
  return series.length === 1 ? `Precio relevado en ${series[0].name}` : "Precio relevado por supermercado";
}

function useAfterFirstFrame() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return ready;
}

function HistoryPlot({ rows, series }: { rows: TimePoint[]; series: Series[] }) {
  const slugs = series.map((serie) => serie.slug);
  const xDomain = timeDomain(rows);
  const showDots = rows.length <= DOTS_UP_TO_DAYS;
  const yAxis = priceAxis(observedPrices(rows, slugs));

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={xDomain}
          ticks={dayTicks(xDomain, 6)}
          tickFormatter={formatAxisDay}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
        />
        <YAxis
          domain={yAxis.domain}
          ticks={yAxis.ticks}
          stroke="var(--muted-foreground)"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={76}
          tickFormatter={(value: number) => formatCurrency(value)}
        />
        <Tooltip
          content={(props) => <ChartTooltip {...(props as Omit<TooltipContentProps, "series">)} series={series} />}
          cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
        />
        {series.map((serie) => (
          <Line
            key={serie.slug}
            // A price holds until the next observation changes it: steps, not slopes.
            type="stepAfter"
            dataKey={serie.slug}
            name={serie.name}
            stroke={seriesStroke(serie.slug)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={showDots ? { r: 3, fill: seriesStroke(serie.slug), stroke: "var(--card)", strokeWidth: 1.5 } : false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            // A day without a price keeps the last observed one until the next.
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PriceChart({ data }: PriceChartProps) {
  const ready = useAfterFirstFrame();
  const rows = toTimePoints(data.points, data.series.map((serie) => serie.slug));
  const hasData = rows.length > 0 && data.series.length > 0;

  return (
    <section className="price-history surface flex flex-col gap-4 p-4 md:p-5" aria-labelledby="historial-titulo">
      <style>{PALETTE_CSS}</style>
      <div className="flex flex-col gap-1">
        <h2 id="historial-titulo" className="text-lg font-semibold text-foreground">Historial de precio</h2>
        <p className="text-sm text-muted-foreground">
          {hasData
            ? `${seriesSubject(data.series)}${data.days ? ` en los últimos ${pluralize(data.days, "día")}` : ""}. Cada punto es una observación.`
            : "Todavía no hay observaciones suficientes para dibujar el historial."}
        </p>
      </div>
      {hasData ? (
        <>
          {/* One series needs no legend: the line is the supermarket the table names. */}
          {data.series.length > 1 ? <ChartLegend series={data.series} /> : null}
          <div className={`${CHART_HEIGHT_CLASS} w-full min-w-0`} role="img" aria-label={`Historial de precio de ${pluralize(data.series.length, "supermercado")}; los datos están en la tabla de abajo.`}>
            {ready ? <HistoryPlot rows={rows} series={data.series} /> : null}
          </div>
          <PriceHistoryTable rows={rows} series={data.series} />
        </>
      ) : null}
    </section>
  );
}
