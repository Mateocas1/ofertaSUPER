import Link from "next/link";

import { UserButton } from "@clerk/nextjs";
import { notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button-variants";
import { requireAdminPageAccess } from "@/lib/admin/access";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ingestion", label: "Ingestion" },
  { href: "/admin/promociones", label: "Promociones" },
  { href: "/admin/promociones/nueva", label: "Nueva promo" },
  { href: "/ofertas", label: "Ver sitio publico" },
];

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminAccess = await requireAdminPageAccess();

  if (adminAccess.status === "unauthenticated") {
    return adminAccess.redirectToSignIn();
  }

  if (adminAccess.status === "forbidden") {
    notFound();
  }

  return (
    <div className="px-6 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="surface p-6 md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">Panel admin</p>
              <h1 className="mt-2 text-4xl font-semibold text-foreground md:text-5xl">Operacion de promociones e ingesta</h1>
              <p className="mt-3 max-w-3xl text-base text-muted-foreground md:text-lg">
                Gestiona promociones manuales, vigila el pipeline V2 y centraliza la observabilidad operativa de Fase 3.
              </p>
            </div>

            <div className="flex items-center gap-3 self-start rounded-full border border-border/70 bg-white/75 px-4 py-2.5">
              <span className="text-sm font-medium text-muted-foreground">Sesion admin</span>
              <UserButton />
            </div>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2" aria-label="Admin navigation">
            {adminLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(buttonVariants({ variant: link.href === "/ofertas" ? "outline" : "ghost", size: "sm" }), "rounded-full")}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </section>

        {children}
      </div>
    </div>
  );
}
