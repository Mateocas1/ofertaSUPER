import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function OfflinePage() {
  return (
    <div className="px-6 py-10 md:py-14">
      <section className="surface mx-auto flex w-full max-w-3xl flex-col gap-5 p-8 text-center md:p-10">
        <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Modo offline</p>
        <h1 className="text-4xl font-semibold text-foreground md:text-5xl">No hay conexion disponible.</h1>
        <p className="text-base leading-7 text-muted-foreground md:text-lg">
          Puedes volver a intentar cuando recuperes internet. La app mantiene activos sus recursos estaticos, pero los precios necesitan red para seguir frescos.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-5")}>
            Reintentar inicio
          </Link>
          <Link href="/canasta" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-full px-5")}>
            Ver canasta local
          </Link>
        </div>
      </section>
    </div>
  );
}