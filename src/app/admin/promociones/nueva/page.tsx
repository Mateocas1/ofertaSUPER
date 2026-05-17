import { AdminPromotionsManager } from "@/components/admin-promotions-manager";
import { listAdminSupermarkets } from "@/lib/admin/promotions";

export default async function NewAdminPromotionPage() {
  const supermarkets = await listAdminSupermarkets();

  return (
    <section className="grid gap-6">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Nueva promocion</p>
        <h2 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">Formulario dedicado de alta</h2>
        <p className="mt-3 max-w-3xl text-base text-muted-foreground">
          Crea una promo nueva sin mezclarla con el listado existente. Si luego necesitas editarla, queda disponible en el modulo de promociones.
        </p>
      </div>

      <AdminPromotionsManager promotions={[]} supermarkets={supermarkets} showList={false} />
    </section>
  );
}