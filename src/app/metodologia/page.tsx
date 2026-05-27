import type { Metadata } from "next";
import Link from "next/link";

import { createMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = createMetadata({
  title: "Metodología",
  description: "Cómo ofertasSUPER compara productos por EAN, muestra frescura y comunica cobertura por supermercado.",
  path: "/metodologia",
});

const METHOD_STEPS = [
  {
    title: "Comparación por EAN",
    label: "01",
    body: "Cada producto se agrupa por su código EAN para comparar el mismo artículo entre supermercados y reducir mezclas entre presentaciones parecidas.",
  },
  {
    title: "Frescura visible",
    label: "02",
    body: "Los precios se muestran como registros guardados. Cuando una fuente supera su ventana esperada, la interfaz lo marca como dato viejo para que la decisión sea conservadora.",
  },
  {
    title: "Cobertura transparente",
    label: "03",
    body: "La canasta informa cuántos productos encuentra cada supermercado. Un total con menor cobertura no se presenta como equivalente a una compra completa.",
  },
] as const;

const QUALITY_RULES = [
  "Un precio registrado no se presenta como valor instantáneo.",
  "La mejor canasta prioriza cobertura y contexto, no sólo el número más bajo.",
  "Las fuentes se revisan con controles de salud antes de usar sus datos para comparar.",
] as const;

export default function MethodologyPage() {
  return (
    <div className="px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="surface overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Metodología
              </p>
              <h1 className="mt-3 max-w-4xl text-4xl font-semibold leading-[0.98] tracking-[-0.05em] text-foreground text-balance sm:text-5xl lg:text-6xl">
                Comparaciones claras para decidir con precios registrados.
              </h1>
            </div>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8 lg:justify-self-end">
              ofertasSUPER cruza productos por EAN, muestra la frescura de cada registro y separa cobertura de precio para evitar lecturas engañosas.
            </p>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr]">
          <div className="surface p-5 sm:p-6 lg:p-7">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cómo se calcula</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">Del producto a la canasta</h2>
              </div>
              <Link
                href="/buscar"
                className="rounded-[0.65rem] border border-primary/45 bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition duration-200 hover:border-primary hover:text-primary active:translate-y-px"
              >
                Buscar productos
              </Link>
            </div>

            <div className="grid gap-4">
              {METHOD_STEPS.map((step) => (
                <article key={step.title} className="grid gap-4 rounded-[0.9rem] border border-border bg-card p-4 sm:grid-cols-[4.5rem_1fr] sm:p-5">
                  <span className="font-mono text-3xl font-semibold tracking-[-0.08em] text-primary/80" aria-hidden="true">
                    {step.label}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold tracking-[-0.03em] text-foreground">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="surface-soft p-5 sm:p-6 lg:p-7" aria-labelledby="quality-rules-title">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Criterios de confianza</p>
            <h2 id="quality-rules-title" className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
              Lectura conservadora de datos
            </h2>
            <ul className="mt-6 space-y-4">
              {QUALITY_RULES.map((rule) => (
                <li key={rule} className="flex gap-3 rounded-[0.85rem] border border-border bg-card px-4 py-3 text-sm leading-6 text-muted-foreground">
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-[0.9rem] border border-primary/20 bg-primary/5 p-4 text-sm leading-6 text-foreground">
              Si un supermercado no cubre todos los productos de una canasta, ofertasSUPER lo muestra como cobertura parcial. Así el total no se confunde con una compra equivalente.
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
