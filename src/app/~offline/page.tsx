import Link from "next/link";

import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/utils";

export default function OfflinePage() {
  return (
    <div className="container-page py-10 md:py-14">
      <section className="surface mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 text-center md:p-5">
        <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">No hay conexion disponible.</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Volvé a intentar cuando recuperes internet. La app guarda sus archivos básicos, pero los precios necesitan
          conexión para consultarse.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/" className={cn(buttonVariants({ size: "lg" }), "rounded-lg px-5")}>
            Reintentar inicio
          </Link>
          <Link href="/canasta" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-lg px-5")}>
            Ver canasta local
          </Link>
        </div>
      </section>
    </div>
  );
}
