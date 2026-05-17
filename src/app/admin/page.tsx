import Link from "next/link";

import { getAdminScraperStats } from "@/lib/admin/dashboard";
import { getAdminPromotionStats } from "@/lib/admin/promotions";
import { buttonVariants } from "@/components/ui/button-variants";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const promotionStatCards = [
  { key: "total", label: "Promociones totales" },
  { key: "active", label: "Promociones activas" },
  { key: "scheduled", label: "Programadas" },
  { key: "expired", label: "Vencidas" },
] as const;

const scraperStatCards = [
  { key: "historyRecords24h", label: "Registros 24h" },
  { key: "updatedProducts24h", label: "Productos refrescados" },
  { key: "activeSupermarkets24h", label: "Supers activos" },
  { key: "staleProducts", label: "Productos stale" },
] as const;

export default async function AdminPage() {
  const [promotionStats, scraperStats] = await Promise.all([getAdminPromotionStats(), getAdminScraperStats()]);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {promotionStatCards.map((card) => (
          <article key={card.key} className="surface-soft p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold text-foreground">{promotionStats[card.key]}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {scraperStatCards.map((card) => (
          <article key={card.key} className="surface-soft p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-4xl font-semibold text-foreground">{scraperStats.overview[card.key]}</p>
          </article>
        ))}
      </section>

      <section className="surface p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Scraper últimas 24h</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">Salud operativa por supermercado</h2>
            <p className="mt-3 max-w-3xl text-base text-muted-foreground">
              Ultimo chequeo global: {scraperStats.overview.latestRunAt ? formatDateTime(scraperStats.overview.latestRunAt) : "sin datos"}.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/admin/ingestion" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
              Ver ingestion V2
            </Link>
            <Link href="/admin/promociones" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
              Ir a promociones
            </Link>
            <Link href="/admin/promociones/nueva" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full px-5")}>
              Nueva promo
            </Link>
          </div>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Super</th>
                <th className="px-4 py-3 font-medium">Productos 24h</th>
                <th className="px-4 py-3 font-medium">Productos stale</th>
                <th className="px-4 py-3 font-medium">Ultimo chequeo</th>
              </tr>
            </thead>
            <tbody>
              {scraperStats.supermarkets.map((item) => (
                <tr key={item.slug} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium text-foreground">{item.name}</td>
                  <td className="px-4 py-3 text-foreground">{item.updatedProducts24h}</td>
                  <td className="px-4 py-3 text-foreground">{item.staleProducts}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {item.latestCheckAt ? formatDateTime(item.latestCheckAt) : "Sin actividad reciente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}