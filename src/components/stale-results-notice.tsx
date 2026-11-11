type StaleResultsNoticeProps = {
  context?: string;
};

export function StaleResultsNotice({ context = "resultados" }: StaleResultsNoticeProps) {
  return (
    <section className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
      <p>
        <span className="font-semibold">No tenemos precios recientes para estos {context}.</span>{" "}
        Son los últimos registrados: revisá la fecha de cada producto antes de comprar.
      </p>
    </section>
  );
}
