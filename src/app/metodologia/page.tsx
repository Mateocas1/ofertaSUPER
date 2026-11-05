import type { Metadata } from "next";
import Link from "next/link";

import { formatCurrency, formatPercentage } from "@/lib/format";
import { DEFAULT_PRICE_DROP_RULES, loadPriceDrops, type PriceDropRules } from "@/lib/price-drops";
import { createMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = createMetadata({
  title: "Metodología",
  description: "Cómo ofertasSUPER compara productos por EAN, muestra frescura y comunica cobertura por supermercado.",
  path: "/metodologia",
});

// The thresholds come from the same payload the drops page renders, so this
// text can never disagree with what /bajas publishes.
function loadRules(): PriceDropRules {
  try {
    return loadPriceDrops().rules;
  } catch {
    return DEFAULT_PRICE_DROP_RULES;
  }
}

const SECTION_LINK = "text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground";

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 py-8 first:pt-0">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-base leading-7 text-muted-foreground">{children}</div>
    </section>
  );
}

function DropThresholds({ rules }: { rules: PriceDropRules }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      <li>
        La baja es de al menos {formatPercentage(rules.minPercentDrop, 0)} y {formatCurrency(rules.minAmountDrop)}.
      </li>
      <li>
        Se compara contra la última observación con un precio distinto, dentro de los {rules.windowDays} días
        anteriores.
      </li>
      <li>El precio nuevo tiene que haberse registrado en las últimas {rules.maxAgeHours} horas.</li>
      <li>
        Una caída de más de {formatPercentage(rules.maxPercentDrop, 0)} se descarta: suele ser un cambio de
        presentación o un error de carga, no una oferta.
      </li>
      <li>Se publican las {rules.limit} mayores por variación porcentual.</li>
    </ul>
  );
}

export default function MethodologyPage() {
  const rules = loadRules();

  return (
    <div className="container-page py-8 md:py-10">
      <article className="max-w-[70ch]">
        <header className="pb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Metodología</h1>
          <p className="mt-3 text-lg leading-7 text-muted-foreground">
            ofertasSUPER cruza productos por EAN, muestra la fecha de cada registro y separa la cobertura del precio
            para evitar lecturas engañosas.
          </p>
          <nav aria-label="En esta página" className="mt-4 flex flex-wrap gap-x-4">
            <a className={`${SECTION_LINK} inline-flex min-h-11 items-center`} href="#comparacion-por-ean">
              Comparación
            </a>
            <a className={`${SECTION_LINK} inline-flex min-h-11 items-center`} href="#frescura">
              Frescura
            </a>
            <a className={`${SECTION_LINK} inline-flex min-h-11 items-center`} href="#cobertura">
              Cobertura
            </a>
            <a className={`${SECTION_LINK} inline-flex min-h-11 items-center`} href="#umbrales-de-bajas">
              Bajas de precio
            </a>
          </nav>
        </header>

        <div className="divide-y divide-border border-t border-border pt-8">
          <Section id="comparacion-por-ean" title="Comparación por EAN">
            <p>
              Cada producto se agrupa por su código EAN para comparar el mismo artículo entre supermercados y reducir
              mezclas entre presentaciones parecidas.
            </p>
          </Section>

          <Section id="frescura" title="Frescura visible">
            <p>
              Los precios se muestran como registros guardados, con la fecha en que se relevaron. Un precio registrado
              no es un valor instantáneo: puede haber cambiado en la góndola o en la tienda online.
            </p>
            <p>
              Cuando una fuente supera su ventana esperada, lo marcamos como dato viejo para que la decisión sea
              conservadora.
            </p>
          </Section>

          <Section id="cobertura" title="Cobertura transparente">
            <p>
              La canasta informa cuántos productos encuentra cada supermercado. Un total con menor cobertura no se
              presenta como equivalente a una compra completa: si falta algún producto, el total queda marcado como
              parcial.
            </p>
            <p>
              La mejor canasta prioriza la cobertura y el contexto, no sólo el número más bajo. Los descuentos
              condicionales de billeteras o bancos no se suman.
            </p>
          </Section>

          <Section id="umbrales-de-bajas" title="Umbrales de las bajas de precio">
            <p>
              <Link href="/bajas" className="text-foreground underline underline-offset-2">
                Las bajas
              </Link>{" "}
              se calculan una vez por día con las mismas reglas para todos los supermercados:
            </p>
            <DropThresholds rules={rules} />
          </Section>

          <Section id="fuentes" title="Fuentes y controles">
            <p>
              Las fuentes se revisan con controles de salud antes de usar sus datos para comparar. Si el catálogo no
              está disponible, mostramos ese estado en lugar de datos de ejemplo.
            </p>
            <p>
              Para la evolución de una canasta fija frente al IPC del INDEC, mirá{" "}
              <Link href="/inflacion" className="text-foreground underline underline-offset-2">
                la página de inflación
              </Link>
              .
            </p>
          </Section>
        </div>
      </article>
    </div>
  );
}
