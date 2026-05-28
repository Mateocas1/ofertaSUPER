type StaleResultsNoticeProps = {
  context?: string;
};

export function StaleResultsNotice({ context = "resultados" }: StaleResultsNoticeProps) {
  return (
    <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
      <p className="font-semibold">Estos {context} son lecturas guardadas.</p>
      <p className="mt-1">
        No tenemos precios recientes para este listado completo. Usalos como referencia y abrí cada producto para ver fecha, fuente y enlace oficial antes de comprar.
      </p>
    </section>
  );
}
