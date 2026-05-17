import Link from "next/link";

import { AdminPromotionsManager } from "@/components/admin-promotions-manager";
import { buttonVariants } from "@/components/ui/button-variants";
import { listAdminPromotions, listAdminSupermarkets } from "@/lib/admin/promotions";
import { getSingleParam } from "@/lib/page-params";
import { promotionTypeOptions, type AdminPromotionStatus, type PromotionTypeValue } from "@/lib/schemas/promotion";
import { cn } from "@/lib/utils";

const statusOptions: Array<{ value: AdminPromotionStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "active", label: "Activas" },
  { value: "scheduled", label: "Programadas" },
  { value: "expired", label: "Vencidas" },
  { value: "inactive", label: "Inactivas" },
];

type AdminPromotionsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPromotionsPage({ searchParams }: AdminPromotionsPageProps) {
  const params = await searchParams;
  const status = (getSingleParam(params.status) as AdminPromotionStatus | undefined) ?? "all";
  const supermarket = getSingleParam(params.super);
  const type = getSingleParam(params.type) as PromotionTypeValue | undefined;
  const query = getSingleParam(params.q);
  const [promotions, supermarkets] = await Promise.all([
    listAdminPromotions({ status, supermarket, type, query }),
    listAdminSupermarkets(),
  ]);

  return (
    <section className="grid gap-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Promociones manuales</p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">Alta, edicion y filtrado operativo</h2>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">
            Carga promociones por supermercado y filtra activas, vencidas o programadas sin salir del panel.
          </p>
        </div>

        <Link href="/admin/promociones/nueva" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
          Nueva promocion
        </Link>
      </div>

      <form className="surface-soft grid gap-3 p-4 md:grid-cols-4" action="/admin/promociones">
        <select name="status" defaultValue={status} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select name="super" defaultValue={supermarket ?? ""} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
          <option value="">Todos los supers</option>
          {supermarkets.map((item) => (
            <option key={item.slug} value={item.slug}>{item.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={type ?? ""} className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground">
          <option value="">Todos los tipos</option>
          {promotionTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <input
          type="text"
          name="q"
          defaultValue={query ?? ""}
          placeholder="Buscar por titulo, banco o billetera"
          className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground md:col-span-4">
          Aplicar filtros
        </button>
      </form>

      <AdminPromotionsManager promotions={promotions} supermarkets={supermarkets} />
    </section>
  );
}