import type { PublicCatalogProvenance } from "@/lib/public-catalog-api";

type CatalogProvenanceNoticeProps = PublicCatalogProvenance;

export function CatalogProvenanceNotice({ degraded }: CatalogProvenanceNoticeProps) {
  if (!degraded) {
    return null;
  }

  return (
    <section
      aria-label="Información de frescura del catálogo"
      className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      <p>
        <span className="font-semibold">Información histórica del catálogo.</span>{" "}
        Son resultados reales de una publicación anterior: los precios o las promociones pueden haber cambiado. Revisá la fecha y la fuente antes de comprar.
      </p>
    </section>
  );
}
