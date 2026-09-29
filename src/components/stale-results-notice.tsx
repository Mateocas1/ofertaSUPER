type StaleResultsNoticeProps = {
  context?: string;
};

export function StaleResultsNotice({ context = "resultados" }: StaleResultsNoticeProps) {
  return (
    <section className="rounded-xl border-2 border-dashed border-warning/60 bg-deal-soft px-5 py-4 text-sm leading-6 text-foreground">
      <p className="font-semibold">Estos {context} son lecturas guardadas.</p>
      <p className="mt-1">
        No tenemos precios recientes para este listado completo. Usalos como referencia y abrí cada producto para ver fecha, fuente y enlace oficial antes de comprar.
      </p>
    </section>
  );
}
