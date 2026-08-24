import type { PublicCatalogProvenance } from "@/lib/public-catalog-api";

type CatalogProvenanceNoticeProps = PublicCatalogProvenance;

export function CatalogProvenanceNotice({ degraded }: CatalogProvenanceNoticeProps) {
  if (!degraded) {
    return null;
  }

  return (
    <section
      aria-label="Información de frescura del catálogo"
      className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"
      role="status"
    >
      <p className="font-semibold">Información histórica del catálogo.</p>
      <p className="mt-1">
        Estos son resultados reales de una publicación anterior. Revisá la fecha, la fuente y el enlace oficial antes de comprar porque los precios o las promociones pueden haber cambiado.
      </p>
    </section>
  );
}
