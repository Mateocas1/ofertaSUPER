import type { LegacyPublicCatalogProvenance } from "@/lib/public-catalog-api";

type CatalogProvenanceNoticeProps = LegacyPublicCatalogProvenance;

export function CatalogProvenanceNotice({ degraded }: CatalogProvenanceNoticeProps) {
  if (!degraded) {
    return null;
  }

  return (
    <section
      aria-label="Origen de los resultados"
      className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950"
      role="status"
    >
      <p className="font-semibold">Estás viendo datos de demostración.</p>
      <p className="mt-1">
        El catálogo no está disponible. Estos ejemplos no representan precios reales ni vigentes; usalos solo para explorar la interfaz.
      </p>
    </section>
  );
}
