"use client";

import { useEffect, useState } from "react";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency, formatDate } from "@/lib/format";

type PriceChartProps = {
  data: {
    series: Array<{
      slug: string;
      name: string;
      color: string;
    }>;
    points: Array<Record<string, number | string | null>>;
  };
};

export function PriceChart({ data }: PriceChartProps) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setIsReady(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  if (data.points.length === 0 || data.series.length === 0) {
    return (
      <div className="surface-soft flex min-h-72 items-center justify-center p-6 text-sm text-muted-foreground">
        No hay suficiente historial para dibujar el grafico todavia.
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="surface flex min-h-80 items-center justify-center p-6 text-sm text-muted-foreground">
        Cargando historial…
      </div>
    );
  }

  return (
    <div className="surface p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Historial de precio</h2>
        <p className="mt-1 text-sm text-muted-foreground">Evolucion diaria consolidada por supermercado.</p>
      </div>

      <div className="h-80 min-h-80 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data.points} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCurrency(value)}
            />
            <Tooltip
              formatter={(value) => formatCurrency(typeof value === "number" ? value : null)}
              labelFormatter={(value) => formatDate(typeof value === "string" ? value : String(value ?? ""))}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--popover)",
                color: "var(--popover-foreground)",
                boxShadow: "var(--elevation-3)",
              }}
            />
            <Legend wrapperStyle={{ color: "var(--foreground)" }} />
            {data.series.map((serie) => (
              <Line
                key={serie.slug}
                type="monotone"
                dataKey={serie.slug}
                name={serie.name}
                stroke={serie.color}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
