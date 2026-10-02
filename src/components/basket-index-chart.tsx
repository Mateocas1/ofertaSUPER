// Server-rendered SVG chart for /inflacion: the daily Laspeyres basket index
// against the INDEC CPI rebased to the same base month. No client JavaScript
// is shipped for this chart. The geometry is a pure function so it can be
// tested without a renderer.

const WIDTH = 760;
const HEIGHT = 300;
const PADDING = { top: 16, right: 16, bottom: 34, left: 52 };

export type BasketIndexChartPoint = { date: string; basket: number | null; cpi: number | null };

type ChartKey = "basket" | "cpi";

export type BasketIndexGeometry = {
  width: number;
  height: number;
  padding: typeof PADDING;
  basketPath: string;
  cpiPath: string;
  valueTicks: { y: number; label: string }[];
  dateTicks: { x: number; label: string }[];
};

function niceTicks(lo: number, hi: number, count: number): number[] {
  return Array.from({ length: count + 1 }, (_, index) => lo + ((hi - lo) * index) / count);
}

function linePath(
  points: BasketIndexChartPoint[],
  key: ChartKey,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  let path = "";
  let open = false;
  points.forEach((point, index) => {
    const value = point[key];
    if (value === null || value === undefined) {
      open = false;
      return;
    }
    path += `${open ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)} `;
    open = true;
  });
  return path.trim();
}

export function buildChartGeometry(points: BasketIndexChartPoint[]): BasketIndexGeometry | null {
  const values = points.flatMap((point) => [point.basket, point.cpi]).filter((value): value is number => value !== null);
  if (points.length < 2 || values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const lo = min - span * 0.08;
  const hi = max + span * 0.08;

  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (index / (points.length - 1)) * plotWidth;
  const y = (value: number) => PADDING.top + (1 - (value - lo) / (hi - lo)) * plotHeight;

  const tickIndexes = new Set([
    0,
    Math.round((points.length - 1) / 3),
    Math.round((2 * (points.length - 1)) / 3),
    points.length - 1,
  ]);

  return {
    width: WIDTH,
    height: HEIGHT,
    padding: PADDING,
    basketPath: linePath(points, "basket", x, y),
    cpiPath: linePath(points, "cpi", x, y),
    valueTicks: niceTicks(lo, hi, 4).map((value) => ({ y: y(value), label: value.toFixed(1) })),
    dateTicks: [...tickIndexes].map((index) => ({ x: x(index), label: points[index].date.slice(5) })),
  };
}

export function BasketIndexChart({ points }: { points: BasketIndexChartPoint[] }) {
  const geometry = buildChartGeometry(points);
  if (!geometry) {
    return (
      <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">
        Todavía no hay suficientes días comparables para dibujar la serie.
      </p>
    );
  }

  const { padding, width, height } = geometry;

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Índice de canasta frente al IPC del INDEC" className="w-full">
        <g className="text-border">
          {geometry.valueTicks.map((tick) => (
            <line
              key={tick.label}
              x1={padding.left}
              x2={width - padding.right}
              y1={tick.y}
              y2={tick.y}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}
        </g>
        <g className="fill-muted-foreground text-[11px]">
          {geometry.valueTicks.map((tick) => (
            <text key={tick.label} x={padding.left - 8} y={tick.y + 4} textAnchor="end">
              {tick.label}
            </text>
          ))}
          {geometry.dateTicks.map((tick) => (
            <text key={tick.label} x={tick.x} y={height - 10} textAnchor="middle">
              {tick.label}
            </text>
          ))}
        </g>
        <path d={geometry.cpiPath} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="6 4" className="text-muted-foreground" />
        <path d={geometry.basketPath} fill="none" stroke="currentColor" strokeWidth={2.5} className="text-primary" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-6 bg-primary" aria-hidden="true" /> Índice de canasta (base {points[0].date})
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-6 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" /> IPC INDEC (rebajado a la misma base)
        </span>
      </figcaption>
    </figure>
  );
}
