import { getAdminIngestionDashboard, type AdminIngestionHealthStat, type IngestionTrendPoint } from "@/lib/admin/ingestion";
import { formatCompactNumber, formatDate, formatDateTime, formatPercentage } from "@/lib/format";

const healthStyles: Record<AdminIngestionHealthStat["state"], { label: string; className: string }> = {
  healthy: {
    label: "Healthy",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
  },
  blocked: {
    label: "Blocked",
    className: "border-rose-300 bg-rose-50 text-rose-900",
  },
  hash_invalid: {
    label: "Hash invalid",
    className: "border-orange-300 bg-orange-50 text-orange-900",
  },
  timeout: {
    label: "Timeout",
    className: "border-amber-300 bg-amber-50 text-amber-900",
  },
  network: {
    label: "Network",
    className: "border-sky-300 bg-sky-50 text-sky-900",
  },
  unknown: {
    label: "Unknown",
    className: "border-zinc-300 bg-zinc-100 text-zinc-800",
  },
  no_data: {
    label: "Sin datos",
    className: "border-zinc-300 bg-zinc-100 text-zinc-800",
  },
};

const runStyles = {
  SUCCESS: "border-emerald-300 bg-emerald-50 text-emerald-900",
  PARTIAL: "border-amber-300 bg-amber-50 text-amber-900",
  FAILED: "border-rose-300 bg-rose-50 text-rose-900",
  RUNNING: "border-sky-300 bg-sky-50 text-sky-900",
  NO_DATA: "border-zinc-300 bg-zinc-100 text-zinc-800",
} as const;

function formatDuration(durationMs: number | null) {
  if (durationMs === null || Number.isNaN(durationMs)) {
    return "-";
  }

  if (durationMs < 1000) {
    return `${durationMs} ms`;
  }

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function getTrendMax(points: IngestionTrendPoint[]) {
  return Math.max(1, ...points.map((point) => Math.max(point.detectedProducts, point.promotedProducts)));
}

export default async function AdminIngestionPage() {
  const dashboard = await getAdminIngestionDashboard();
  const trendMax = getTrendMax(dashboard.trend);
  const histogramMax = Math.max(1, ...dashboard.qualityDistribution.map((bucket) => bucket.count));
  const freshnessModeLabel =
    dashboard.freshness.measurementMode === "mixed"
      ? "mix prod/shadow"
      : dashboard.freshness.measurementMode === "shadow"
        ? "shadow"
        : "produccion";

  return (
    <div className="grid gap-6">
      <section className="surface overflow-hidden p-6 md:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Observabilidad de ingesta</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground md:text-5xl">Salud, frescura y calidad del pipeline V2</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground md:text-lg">
              Panel operativo para validar el ultimo estado por fuente, vigilar el SLA de frescura y detectar degradaciones de calidad antes del cutover definitivo.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <article className="surface-soft p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Freshness global</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatPercentage(dashboard.overview.overallFreshnessPercent)}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Base: {freshnessModeLabel}</p>
              </article>
              <article className="surface-soft p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Fuentes healthy</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{dashboard.overview.healthySources}/6</p>
              </article>
              <article className="surface-soft p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Promovidos 30d</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatCompactNumber(dashboard.overview.promotedProducts30d)}</p>
              </article>
              <article className="surface-soft p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quality score 30d</p>
                <p className="mt-2 text-3xl font-semibold text-foreground">{formatPercentage(dashboard.overview.averageQualityScore30d)}</p>
              </article>
            </div>
          </div>

          <aside className="surface-soft p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Gauge SLA</p>
                <h3 className="mt-2 text-2xl font-semibold text-foreground">Productos frescos dentro de la ventana</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ultimo run detectado: {dashboard.overview.latestRunAt ? formatDateTime(dashboard.overview.latestRunAt) : "sin datos"}.
                </p>
                <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Lectura SLA basada en {freshnessModeLabel}.
                </p>
              </div>
              <div
                className="flex size-36 shrink-0 items-center justify-center rounded-full border border-border/70"
                style={{
                  background: `conic-gradient(rgb(210 71 38) 0deg ${Math.min(360, dashboard.overview.overallFreshnessPercent * 3.6)}deg, rgba(255,255,255,0.75) ${Math.min(360, dashboard.overview.overallFreshnessPercent * 3.6)}deg 360deg)`,
                }}
                aria-hidden="true"
              >
                <div className="flex size-24 flex-col items-center justify-center rounded-full bg-white/90 text-center shadow-sm">
                  <span className="text-3xl font-semibold text-foreground">{Math.round(dashboard.overview.overallFreshnessPercent)}</span>
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">% fresco</span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Bajo SLA</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{dashboard.overview.sourcesBelowSla}</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Blocked</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{dashboard.overview.blockedSources}</p>
              </div>
              <div className="rounded-[1.25rem] border border-border/70 bg-white/80 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Runs failed</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{dashboard.overview.failedSources}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="surface p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Ultima ejecucion</p>
              <h3 className="mt-2 text-3xl font-semibold text-foreground">Estado por fuente</h3>
            </div>
            <p className="text-sm text-muted-foreground">Lectura directa desde la tabla de ejecuciones de ingesta.</p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Fuente</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Duracion</th>
                  <th className="px-4 py-3 font-medium">Fetched</th>
                  <th className="px-4 py-3 font-medium">Staged</th>
                  <th className="px-4 py-3 font-medium">Promoted</th>
                  <th className="px-4 py-3 font-medium">Rejected</th>
                  <th className="px-4 py-3 font-medium">Inicio</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.runs.map((run) => (
                  <tr key={run.slug} className="border-t border-border/60 align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{run.name}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${runStyles[run.status]}`}>
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{formatDuration(run.durationMs)}</td>
                    <td className="px-4 py-3 text-foreground">{run.productsFetched}</td>
                    <td className="px-4 py-3 text-foreground">{run.productsStaged}</td>
                    <td className="px-4 py-3 text-foreground">{run.productsPromoted}</td>
                    <td className="px-4 py-3 text-foreground">
                      <div>
                        <p>{run.productsRejected}</p>
                        <p className="text-xs text-muted-foreground">{formatPercentage(run.rejectionRate)}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {run.startedAt ? formatDateTime(run.startedAt) : "Sin datos"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="surface p-6 md:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Distribucion de calidad</p>
            <h3 className="mt-2 text-3xl font-semibold text-foreground">Histogram 30d</h3>
          </div>

          <div className="mt-8 grid grid-cols-5 items-end gap-3">
            {dashboard.qualityDistribution.map((bucket) => (
              <div key={bucket.id} className="flex flex-col items-center gap-3">
                <div className="flex h-52 w-full items-end rounded-[1.5rem] bg-muted/45 p-2">
                  <div
                    className="w-full rounded-[1rem] bg-[linear-gradient(180deg,rgba(42,111,88,0.75),rgba(42,111,88,0.25))]"
                    style={{ height: `${Math.max(12, (bucket.count / histogramMax) * 100)}%` }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">{formatCompactNumber(bucket.count)}</p>
                  <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{bucket.label}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <article className="surface p-6 md:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Health grid</p>
            <h3 className="mt-2 text-3xl font-semibold text-foreground">Probe actual por supermercado</h3>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {dashboard.health.map((item) => (
              <article key={item.slug} className="surface-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.slug}</p>
                    <h4 className="mt-1 text-xl font-semibold text-foreground">{item.name}</h4>
                  </div>
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${healthStyles[item.state].className}`}>
                    {healthStyles[item.state].label}
                  </span>
                </div>

                <div className="mt-5 space-y-2 text-sm text-muted-foreground">
                  <p>Hash: <strong className="text-foreground">{item.hashValid ? "valido" : "invalido"}</strong></p>
                  <p>Response: <strong className="text-foreground">{item.responseTimeMs !== null ? `${item.responseTimeMs} ms` : "-"}</strong></p>
                  <p>Returned: <strong className="text-foreground">{item.productsReturned}</strong></p>
                  <p>Ultimo probe: <strong className="text-foreground">{item.checkedAt ? formatDateTime(item.checkedAt) : "sin datos"}</strong></p>
                  <p>Error: <strong className="text-foreground">{item.errorType ?? "ninguno"}</strong></p>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="surface p-6 md:p-8">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Freshness por fuente</p>
            <h3 className="mt-2 text-3xl font-semibold text-foreground">Cumplimiento de SLA</h3>
          </div>

          <div className="mt-6 space-y-4">
            {dashboard.freshness.sources.map((source) => (
              <article key={source.slug} className="rounded-[1.5rem] border border-border/70 bg-white/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{source.name}</p>
                    <p className="text-sm text-muted-foreground">
                      SLA {source.slaHours}h · {source.freshProducts}/{source.totalProducts} productos frescos
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      Base: {source.measurementBasis === "shadow" ? "shadow" : "produccion"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-foreground">{formatPercentage(source.freshnessPercent)}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {source.latestCheckAt ? formatDateTime(source.latestCheckAt) : "sin chequeo"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 h-4 overflow-hidden rounded-full bg-muted/60">
                  <div
                    className={source.isBelowAlertThreshold ? "h-full rounded-full bg-rose-400" : source.isBelowTarget ? "h-full rounded-full bg-amber-400" : "h-full rounded-full bg-emerald-500"}
                    style={{ width: `${Math.min(100, Math.max(4, source.freshnessPercent))}%` }}
                  />
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Trend 30d</p>
            <h3 className="mt-2 text-3xl font-semibold text-foreground">Cobertura detectada y promocion a produccion</h3>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Barras grandes: EAN detectados en staging. Barras cortas: productos promovidos desde el reconciliador.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-[#2a6f58]" aria-hidden="true" /> detectados</span>
            <span className="inline-flex items-center gap-2"><span className="size-3 rounded-full bg-[#d24726]" aria-hidden="true" /> promovidos</span>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <div
            className="grid min-w-[900px] gap-3"
            style={{
              gridTemplateColumns: `repeat(${dashboard.trend.length}, minmax(0, 1fr))`,
            }}
          >
            {dashboard.trend.map((point) => (
              <div key={point.date} className="flex flex-col items-center gap-3">
                <div className="flex h-56 w-full items-end gap-1 rounded-[1.5rem] bg-muted/45 p-2">
                  <div
                    className="w-1/2 rounded-[0.8rem] bg-[linear-gradient(180deg,rgba(42,111,88,0.85),rgba(42,111,88,0.25))]"
                    style={{ height: `${Math.max(6, (point.detectedProducts / trendMax) * 100)}%` }}
                  />
                  <div
                    className="w-1/2 rounded-[0.8rem] bg-[linear-gradient(180deg,rgba(210,71,38,0.85),rgba(210,71,38,0.25))]"
                    style={{ height: `${Math.max(6, (point.promotedProducts / trendMax) * 100)}%` }}
                  />
                </div>
                <div className="text-center text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{formatDate(point.date)}</p>
                  <p>{point.detectedProducts} / {point.promotedProducts}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}