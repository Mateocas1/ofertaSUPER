import { LoaderCircle } from "lucide-react";

import { SupermarketBadge } from "@/components/supermarket-badge";
import { compareMixToBestSingle, type BasketPlan, type BasketSuperSummary, type MixComparison } from "@/lib/basket-mix";
import { formatCurrency, pluralize } from "@/lib/format";

// The automatic mix is the one place the receipt look (.ticket, .tear-off,
// .price-tag) is used: it is the basket total, nothing else.
function MixVerdict({ comparison }: { comparison: MixComparison }) {
  switch (comparison.kind) {
    case "saves":
      return (
        <p className="text-sm text-foreground">
          <span className="price-tag mr-2">Ahorrás {formatCurrency(comparison.amount)}</span>
          frente a la mejor canasta en un solo súper ({formatCurrency(comparison.bestSingle.total)} en{" "}
          {comparison.bestSingle.name}).
        </p>
      );
    case "same":
      return (
        <p className="text-sm text-muted-foreground">
          Cuesta lo mismo que la mejor canasta en un solo súper ({comparison.bestSingle.name}): mezclar no ahorra.
        </p>
      );
    case "costs-more":
      return (
        <p className="text-sm text-foreground">
          Tus elecciones cuestan {formatCurrency(comparison.amount)} más que comprar todo en{" "}
          {comparison.bestSingle.name} ({formatCurrency(comparison.bestSingle.total)}).
        </p>
      );
    case "no-complete-single":
      return (
        <p className="text-sm text-muted-foreground">
          Ningún supermercado tiene todos los productos, así que no hay una canasta en un solo súper para comparar.
        </p>
      );
    case "incomplete":
      return (
        <p className="text-sm text-muted-foreground">
          La mezcla está incompleta: {pluralize(comparison.missing, "producto")} sin precio elegible todavía.
        </p>
      );
  }
}

export function BasketReceipt({ plan, degradedDemo }: { plan: BasketPlan; degradedDemo: boolean }) {
  return (
    <section className="ticket bg-surface-1 px-6 py-5" aria-labelledby="basket-mix-title">
      <h2 id="basket-mix-title" className="text-sm font-medium text-muted-foreground">
        Tu mezcla: cada producto en el súper que elegiste (por defecto, el más barato)
      </h2>
      <p className="price mt-2 text-4xl text-foreground">{formatCurrency(plan.mixedTotal)}</p>
      <hr className="tear-off my-4" />
      <MixVerdict comparison={compareMixToBestSingle(plan)} />
      <p className="mt-2 text-xs text-muted-foreground">Cambiá el súper de cada producto y la mezcla respeta tu elección.</p>
      {degradedDemo ? (
        <p className="mt-2 text-xs text-warning">Estimación histórica: los valores pueden estar desactualizados.</p>
      ) : null}
    </section>
  );
}

function SummaryRow({ summary, isBest, degradedDemo }: { summary: BasketSuperSummary; isBest: boolean; degradedDemo: boolean }) {
  return (
    <li className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <SupermarketBadge name={summary.name} slug={summary.slug} logoUrl={summary.logoUrl} highlight={isBest} />
        <p className="mt-1 text-xs text-muted-foreground">
          {pluralize(summary.coveredItems, "producto")} con precio · {pluralize(summary.missingItems, "faltante")}
          {isBest ? <span className="font-medium text-primary"> · {degradedDemo ? "Mejor estimación completa" : "Mejor canasta completa"}</span> : null}
        </p>
      </div>
      <p className="price shrink-0 text-xl text-foreground">{formatCurrency(summary.total)}</p>
    </li>
  );
}

export function SupermarketTotals({
  summaries,
  bestSlug,
  degradedDemo,
  isPending,
}: {
  summaries: BasketSuperSummary[];
  bestSlug: string | null;
  degradedDemo: boolean;
  isPending: boolean;
}) {
  return (
    <section className="surface p-4 md:p-5" aria-labelledby="basket-totals-title">
      <div className="flex items-center justify-between gap-4">
        <h2 id="basket-totals-title" className="text-lg font-semibold text-foreground">
          {degradedDemo ? "Estimación histórica por supermercado" : "Total por supermercado"}
        </h2>
        {isPending ? <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-label="Actualizando" /> : null}
      </div>
      {summaries.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Todavía no hay cobertura suficiente en más de un supermercado para calcular un total.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {summaries.map((summary) => (
            <SummaryRow key={summary.slug} summary={summary} isBest={bestSlug === summary.slug} degradedDemo={degradedDemo} />
          ))}
        </ul>
      )}
    </section>
  );
}
