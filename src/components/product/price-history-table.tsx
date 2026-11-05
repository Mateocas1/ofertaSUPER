import { formatCurrency } from "@/lib/format";

import { formatLongDay, type TimePoint } from "./price-history-model";

type PriceHistoryTableProps = {
  rows: TimePoint[];
  series: Array<{ slug: string; name: string }>;
};

// The chart's table view: every observed day and price, newest first, so the
// data never depends on reading colors or hovering.
export function PriceHistoryTable({ rows, series }: PriceHistoryTableProps) {
  const newestFirst = [...rows].reverse();
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        Ver los datos en una tabla
      </summary>
      <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Precio relevado por día y supermercado</caption>
          <thead className="sticky top-0 bg-card">
            <tr>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Día</th>
              {series.map((serie) => (
                <th key={serie.slug} scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{serie.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row) => (
              <tr key={row.t} className="border-t border-border">
                <th scope="row" className="px-3 py-1.5 text-left font-normal whitespace-nowrap text-foreground">{formatLongDay(row.t)}</th>
                {series.map((serie) => (
                  <td key={serie.slug} className="price px-3 py-1.5 text-right text-foreground">
                    {row[serie.slug] === null ? <span className="text-muted-foreground">—</span> : formatCurrency(row[serie.slug])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
