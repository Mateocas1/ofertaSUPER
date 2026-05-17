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
        <h2 className="text-2xl font-semibold text-foreground">Historial de precio</h2>
        <p className="mt-1 text-sm text-muted-foreground">Evolucion diaria consolidada por supermercado.</p>
      </div>

      <div className="h-80 min-h-80 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data.points} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              stroke="rgba(100, 116, 139, 0.9)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="rgba(100, 116, 139, 0.9)"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => formatCurrency(value)}
            />
            <Tooltip
              formatter={(value) => formatCurrency(typeof value === "number" ? value : null)}
              labelFormatter={(value) => formatDate(typeof value === "string" ? value : String(value ?? ""))}
              contentStyle={{
                borderRadius: 18,
                border: "1px solid rgba(226, 232, 240, 0.9)",
                boxShadow: "0 16px 48px rgba(15, 23, 42, 0.10)",
              }}
            />
            <Legend />
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
