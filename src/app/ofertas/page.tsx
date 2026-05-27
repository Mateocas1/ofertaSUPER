import type { Metadata } from "next";

import { ProductCard } from "@/components/product-card";
import { PromotionBadge } from "@/components/promotion-badge";
import { SupermarketBadge } from "@/components/supermarket-badge";
import { getPromotions, listProducts } from "@/lib/catalog";
import { getSingleParam } from "@/lib/page-params";
import { createMetadata } from "@/lib/seo/metadata";
import { SUPERMARKETS } from "@/lib/supermarkets";

export const revalidate = 21600;

type OffersPageProps = {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = createMetadata({
	title: "Hub de ofertas",
	description:
		"Promociones activas y productos con descuento detectado en supermercados argentinos.",
	path: "/ofertas",
});

export default async function OffersPage({ searchParams }: OffersPageProps) {
	const params = await searchParams;
	const supermarket = getSingleParam(params.super);
	const wallet = getSingleParam(params.wallet);
	const type = getSingleParam(params.type) as
		| "2x1"
		| "2nd_50"
		| "wallet_discount"
		| "bank_discount"
		| "percentage"
		| undefined;

	const [promotions, discountedProducts] = await Promise.all([
		getPromotions({ supermarket, wallet, type }),
		listProducts({
			supermarket,
			offersOnly: true,
			sort: "discount",
			limit: 24,
			page: 1,
		}),
	]);

	return (
		<div className="px-6 py-8 md:py-10">
			<div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
				<section className="surface p-8 md:p-10">
					<div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
						<div>
							<p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
								Hub de ofertas
							</p>
							<h1 className="mt-2 text-4xl font-semibold text-foreground md:text-6xl">
								Promos manuales y descuentos detectados
							</h1>
							<p className="mt-3 max-w-3xl text-lg text-muted-foreground">
								Cruza promociones activas de bancos y billeteras con descuentos
								detectados automaticamente por diferencia entre list price y
								precio registrado.
							</p>
						</div>

						<form
							className="surface-soft grid gap-3 p-4 md:grid-cols-4"
							action="/ofertas"
						>
							<label className="sr-only" htmlFor="offers-supermarket-filter">
								Supermercado
							</label>
							<select
								id="offers-supermarket-filter"
								name="super"
								defaultValue={supermarket ?? ""}
								className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground"
							>
								<option value="">Todos los supers</option>
								{SUPERMARKETS.map((item) => (
									<option key={item.slug} value={item.slug}>
										{item.name}
									</option>
								))}
							</select>
							<label className="sr-only" htmlFor="offers-wallet-filter">
								Billetera o banco
							</label>
							<input
								id="offers-wallet-filter"
								type="text"
								name="wallet"
								defaultValue={wallet ?? ""}
								placeholder="Billetera o banco"
								className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
							/>
							<label className="sr-only" htmlFor="offers-type-filter">
								Tipo de promoción
							</label>
							<select
								id="offers-type-filter"
								name="type"
								defaultValue={type ?? ""}
								className="rounded-2xl border border-border/70 bg-white px-3 py-2 text-sm text-foreground"
							>
								<option value="">Todos los tipos</option>
								<option value="2x1">2x1</option>
								<option value="2nd_50">2da al 50%</option>
								<option value="wallet_discount">Billetera</option>
								<option value="bank_discount">Banco</option>
								<option value="percentage">% Off</option>
							</select>
							<button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
								Filtrar
							</button>
						</form>
					</div>
				</section>

				<section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
					<div className="surface p-6">
						<div>
							<p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
								Promociones activas
							</p>
							<h2 className="mt-2 text-3xl font-semibold text-foreground">
								Carga manual administrable
							</h2>
						</div>

						<div className="mt-6 space-y-4">
							{promotions.map((promotion) => (
								<article
									key={promotion.id}
									className="rounded-[1.5rem] border border-border/70 bg-white/80 p-5"
								>
									<div className="flex flex-wrap items-center gap-2">
										<PromotionBadge type={promotion.type} />
										<SupermarketBadge
											name={promotion.supermarket.name}
											slug={promotion.supermarket.slug}
											logoUrl={promotion.supermarket.logoUrl}
										/>
									</div>
									<h3 className="mt-4 text-xl font-semibold text-foreground">
										{promotion.title}
									</h3>
									<p className="mt-2 text-sm leading-6 text-muted-foreground">
										{[
											promotion.walletProvider,
											promotion.bankName,
											promotion.conditions,
										]
											.filter(Boolean)
											.join(" • ") || "Sin condiciones registradas"}
									</p>
								</article>
							))}

							{promotions.length === 0 ? (
								<article className="rounded-[1.5rem] border border-dashed border-border bg-white/70 p-5 text-sm text-muted-foreground">
									No hay promociones manuales activas con estos filtros.
								</article>
							) : null}
						</div>
					</div>

					<div className="space-y-5">
						<div>
							<p className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
								Descuento automatico
							</p>
							<h2 className="mt-2 text-3xl font-semibold text-foreground">
								Productos con list price por encima del precio registrado
							</h2>
						</div>
						<div className="grid gap-5 md:grid-cols-2">
							{discountedProducts.items.map((product) => (
								<ProductCard key={product.ean} product={product} />
							))}
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
