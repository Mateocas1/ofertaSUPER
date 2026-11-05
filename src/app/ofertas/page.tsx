import { cache } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { CatalogProvenanceNotice } from "@/components/catalog-provenance-notice";
import { PromotionBadge } from "@/components/promotion-badge";
import { FilterSelect, SupermarketFilter, type FilterOption } from "@/components/search/catalog-filters";
import { CatalogMessage, CatalogUnavailable, ProductGrid } from "@/components/search/catalog-states";
import { FilterForm } from "@/components/search/filter-form";
import { resultCountLabel } from "@/components/search/result-count";
import { getSingleParam } from "@/lib/page-params";
import { loadSnapshotProductList, resolveSnapshotCatalogPage } from "@/lib/public-pages";
import type { PromotionSummary } from "@/lib/catalog";
import { createMetadata, createUnavailableCatalogMetadata } from "@/lib/seo/metadata";

import { filterPromotions, promotionPaymentNames, type PromotionFilters } from "./promotion-filters";

export const revalidate = 21600;

type OffersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PROMOTION_TYPE_OPTIONS: FilterOption[] = [
  { value: "", label: "Todos" },
  { value: "2x1", label: "2x1" },
  { value: "2nd_50", label: "2da al 50%" },
  { value: "wallet_discount", label: "Billetera" },
  { value: "bank_discount", label: "Banco" },
  { value: "percentage", label: "Porcentaje" },
];

// The snapshot carries no bank or wallet promotions yet (Gate 4c), so the
// page shows the list-price discounts it can prove from the committed data and
// renders the promotions section only when promotions exist.
const loadOffersPage = cache(async (supermarket: PromotionFilters["supermarket"]) =>
  resolveSnapshotCatalogPage({}, () => ({
    promotions: [] as PromotionSummary[],
    discountedProducts: loadSnapshotProductList({
      supermarket,
      offersOnly: true,
      sort: "discount",
      limit: 24,
      page: 1,
    }),
  })));

type OffersPageData = Awaited<ReturnType<typeof loadOffersPage>>;
type OffersCatalog = Extract<OffersPageData, { availability: "eligible" }>["catalog"];

function filtersFrom(params: Record<string, string | string[] | undefined>): PromotionFilters {
  return {
    supermarket: getSingleParam(params.super) || undefined,
    wallet: getSingleParam(params.wallet) || undefined,
    type: getSingleParam(params.type) || undefined,
  };
}

function OffersFilters({ filters, promotions }: { filters: PromotionFilters; promotions: PromotionSummary[] }) {
  const paymentOptions: FilterOption[] = [
    { value: "", label: "Todas" },
    ...promotionPaymentNames(promotions).map((name) => ({ value: name, label: name })),
  ];
  return (
    <FilterForm key={`${filters.supermarket ?? ""}|${filters.wallet ?? ""}|${filters.type ?? ""}`} action="/ofertas" label="Filtrar ofertas">
      <SupermarketFilter id="offers-supermarket-filter" value={filters.supermarket} />
      {promotions.length > 0 ? (
        <>
          <FilterSelect id="offers-wallet-filter" name="wallet" label="Banco o billetera" value={filters.wallet} options={paymentOptions} />
          <FilterSelect id="offers-type-filter" name="type" label="Tipo de promoción" value={filters.type} options={PROMOTION_TYPE_OPTIONS} />
        </>
      ) : null}
    </FilterForm>
  );
}

function PromotionsSection({ promotions }: { promotions: PromotionSummary[] }) {
  return (
    <section aria-labelledby="promotions-heading" className="flex flex-col gap-3">
      <h2 id="promotions-heading" className="text-lg font-semibold text-foreground">Promociones de bancos y billeteras</h2>
      <ul className="surface divide-y divide-border">
        {promotions.map((promotion) => (
          <li key={promotion.id} className="flex flex-col gap-1 p-4 md:flex-row md:items-baseline md:gap-4">
            <div className="flex items-center gap-2">
              <PromotionBadge type={promotion.type} />
              <span className="text-sm font-medium text-foreground">{promotion.supermarket.name}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{promotion.title}</p>
              <p className="text-sm text-muted-foreground">
                {[promotion.walletProvider, promotion.bankName, promotion.conditions].filter(Boolean).join(" · ") || "Sin condiciones registradas"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DiscountedProducts({ catalog }: { catalog: OffersCatalog }) {
  const { discountedProducts } = catalog;
  if (discountedProducts.items.length === 0) {
    return (
      <CatalogMessage title="No hay productos con descuento para este filtro.">
        <p>Probá con otro supermercado.</p>
      </CatalogMessage>
    );
  }
  return (
    <section aria-labelledby="discounts-heading" className="flex flex-col gap-3">
      <h2 id="discounts-heading" className="sr-only">Productos con descuento, de mayor a menor</h2>
      <ProductGrid products={discountedProducts.items} label="Productos con descuento" />
    </section>
  );
}

function OffersResults({ page, filters }: { page: OffersPageData; filters: PromotionFilters }) {
  if (page.availability === "unavailable") {
    return <CatalogUnavailable>No podemos mostrar promociones ni descuentos reales en este momento. Probá de nuevo más tarde.</CatalogUnavailable>;
  }

  const promotions = filterPromotions(page.catalog.promotions, filters);
  return (
    <>
      <CatalogProvenanceNotice {...page.catalog} />
      {promotions.length > 0 ? <PromotionsSection promotions={promotions} /> : null}
      <DiscountedProducts catalog={page.catalog} />
    </>
  );
}

export async function generateMetadata({ searchParams }: OffersPageProps): Promise<Metadata> {
  const filters = filtersFrom(await searchParams);
  const page = await loadOffersPage(filters.supermarket);
  if (page.availability === "unavailable") return createUnavailableCatalogMetadata();

  return createMetadata({
    title: "Ofertas",
    description: "Productos con precio por debajo de su precio de lista en supermercados argentinos, según el último relevamiento.",
    path: "/ofertas",
  });
}

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const filters = filtersFrom(await searchParams);
  const page = await loadOffersPage(filters.supermarket);
  const catalog = page.availability === "eligible" ? page.catalog : null;

  return (
    <div className="container-page flex flex-col gap-5 py-6 md:py-8">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">Ofertas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Productos con precio por debajo de su precio de lista, según el último relevamiento.{" "}
            <Link href="/metodologia" className="font-medium text-foreground underline underline-offset-4 hover:text-primary">Cómo lo medimos</Link>
          </p>
          {catalog ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {resultCountLabel(catalog.discountedProducts.total, catalog.discountedProducts.items.length)}, de mayor a menor descuento
            </p>
          ) : null}
        </div>
        {catalog ? <OffersFilters filters={filters} promotions={catalog.promotions} /> : null}
      </header>
      <OffersResults page={page} filters={filters} />
    </div>
  );
}
