import type { ReactNode, SVGProps } from "react";
import Link from "next/link";

import {
	HOME_HERO,
	HOME_PRODUCT_ROWS,
	MARKET_PULSE_ITEMS,
	SMART_BASKET,
} from "@/lib/home-ui-data";
import { cn } from "@/lib/utils";

type ProductTone = (typeof SMART_BASKET.products)[number]["tone"];
type RankingAccent = (typeof SMART_BASKET.ranking)[number]["accent"];
type PulseTone = (typeof MARKET_PULSE_ITEMS)[number]["tone"];

const productToneClasses: Record<ProductTone, string> = {
	mint: "border-primary/25 bg-accent text-accent-foreground",
	blue: "border-chart-3/30 bg-chart-3/15 text-foreground",
	orange: "border-deal/30 bg-deal-soft text-deal-ink",
	yellow: "border-chart-2/30 bg-chart-2/20 text-foreground",
};

const marketMarkClasses: Record<RankingAccent, string> = {
	green: "border-transparent bg-primary text-primary-foreground",
	blue: "border-transparent bg-chart-3 text-background",
	red: "border-transparent bg-destructive text-background",
};

const pulseValueClasses: Record<PulseTone, string> = {
	green: "text-primary",
	amber: "text-warning",
};

export const revalidate = 21600;

export default function Home() {
	return (
		<div className="px-4 pb-12 pt-8 sm:px-6 lg:pb-16 lg:pt-8">
			<div className="mx-auto flex w-full max-w-[22.5rem] flex-col gap-8 sm:max-w-[1512px] lg:gap-10">
				<section className="grid min-w-0 gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
					<div className="min-w-0 space-y-7 lg:pl-2">
						<div className="space-y-5">
							<h1 className="max-w-full text-[2.75rem] font-extrabold leading-[0.95] tracking-[-0.05em] text-balance text-foreground sm:max-w-[13ch] sm:text-[3.75rem] xl:text-[4.5rem]">
								Compará precios. Armá tu canasta.{" "}
								<span className="text-primary [text-decoration:underline_wavy_color-mix(in_oklab,var(--deal)_70%,transparent)_2px] [text-underline-offset:0.12em]">Comprá mejor.</span>
							</h1>
							<p className="max-w-full text-base leading-7 text-muted-foreground sm:max-w-[34rem] sm:text-lg sm:leading-8">
								{HOME_HERO.body}
							</p>
						</div>

						<div className="w-full max-w-full space-y-4 sm:max-w-[34rem]">
							<form
								action="/buscar"
								role="search"
								aria-label="Buscar productos"
								className="group/search relative"
							>
								<label htmlFor="home-search" className="sr-only">
									Buscar producto
								</label>
								<div className="flex min-h-16 items-center gap-3 rounded-2xl border-2 border-foreground/15 bg-card px-3 shadow-[var(--elevation-2)] [transition:border-color_200ms_var(--ease-out),box-shadow_200ms_var(--ease-out)] focus-within:border-primary focus-within:shadow-[var(--elevation-3)]">
									<SearchIcon
										className="size-5 shrink-0 text-foreground"
										aria-hidden="true"
									/>
									<input
										id="home-search"
										name="q"
										type="search"
										placeholder={HOME_HERO.searchPlaceholder}
										autoComplete="off"
										className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
									/>
									<button
										type="submit"
										className="press min-h-11 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 sm:px-5"
									>
										Buscar
									</button>
								</div>
							</form>

							<div className="flex flex-wrap items-center gap-2 text-sm">
								<span className="mr-1 text-xs font-medium text-muted-foreground">
									Búsquedas rápidas:
								</span>
								{HOME_HERO.quickSearches.map((search) => (
									<Link
										key={search}
										href={`/buscar?q=${encodeURIComponent(search)}`}
										className="press inline-flex min-h-11 items-center rounded-full border border-dashed border-foreground/25 bg-card px-4 text-xs font-medium text-muted-foreground [transition:color_200ms_var(--ease-out),border-color_200ms_var(--ease-out),transform_160ms_var(--ease-out)] hover:border-primary hover:text-primary"
									>
										{search}
									</Link>
								))}
							</div>
						</div>

						<dl className="flex w-full max-w-full flex-wrap gap-3 sm:max-w-[34rem]">
							{HOME_HERO.signals.map((signal, index) => (
								<div
									key={signal}
									className="inline-flex items-center gap-2 rounded-lg bg-surface-1 px-3.5 py-2 text-xs text-muted-foreground"
								>
									<span
										className={cn(
											"size-2 rounded-full border",
											index === 0
												? "border-primary/30 bg-primary" : "border-foreground/30 bg-card",
										)}
										aria-hidden="true"
									/>
									<dt className="sr-only">Señal</dt>
									<dd>{signal}</dd>
								</div>
							))}
						</dl>
					</div>

					<SmartBasketPanel />
				</section>

				<section className="grid min-w-0 gap-8 xl:grid-cols-[1.55fr_0.7fr]">
					<ProductRowsPreview />
					<MarketPulse />
				</section>
			</div>
		</div>
	);
}

function SmartBasketPanel() {
	return (
		<aside
			className="surface-raised animate-enter min-w-0 overflow-hidden p-4 sm:p-6 lg:p-7"
			aria-labelledby="smart-basket-title"
		>
			<div className="mb-5 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-3">
					<h2
						id="smart-basket-title"
						className="text-2xl font-bold text-foreground sm:text-3xl"
					>
						{SMART_BASKET.title}
					</h2>
					<span className="rounded-full bg-surface-3 px-3 py-1 text-xs font-medium text-muted-foreground">
						{SMART_BASKET.summary}
					</span>
				</div>
				<Link
					href="/canasta"
					className="press inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-xs font-semibold text-foreground [transition:color_200ms_var(--ease-out),border-color_200ms_var(--ease-out),transform_160ms_var(--ease-out)] hover:border-primary hover:text-primary"
				>
					Abrir canasta
				</Link>
			</div>

			<div className="grid gap-5 xl:grid-cols-[0.58fr_1fr]">
				<div className="space-y-3">
					<div>
						<p className="text-sm font-semibold text-foreground">{SMART_BASKET.basketLabel}</p>
						<p className="text-xs text-muted-foreground">{SMART_BASKET.summary}</p>
					</div>
					<ul className="stagger divide-y-2 divide-dashed divide-border">
						{SMART_BASKET.products.map((product) => (
							<li
								key={product.name}
								className="flex items-center gap-4 py-3 first:pt-1"
							>
								<ProductThumb label={product.shortLabel} tone={product.tone} />
								<div className="min-w-0">
									<p className="truncate text-sm font-semibold text-foreground">
										{product.name}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{product.brand}
									</p>
								</div>
							</li>
						))}
					</ul>
				</div>

				<div className="ticket overflow-hidden rounded-xl border border-border bg-card"> <div className="border-b-2 border-dashed border-border bg-surface-1 px-4 py-3">
						<p className="text-sm font-semibold text-foreground">
							{SMART_BASKET.comparisonLabel}
						</p>
						<p className="mt-1 text-xs text-muted-foreground">{SMART_BASKET.totalsLabel}</p>
					</div>
					<div className="hidden grid-cols-[1fr_0.7fr_0.85fr_0.65fr] gap-3 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
						<span>Supermercado</span>
						<span>Total</span>
						<span>Cobertura</span>
						<span>Estado</span>
					</div>
					<div className="stagger divide-y divide-border"> {SMART_BASKET.ranking.map((item, index) => (
							<div
								key={item.supermarket}
								className={cn(
									"relative grid gap-3 px-4 py-4 text-sm md:grid-cols-[1fr_0.7fr_0.85fr_0.65fr] md:items-center",
									index === 0 && "settle bg-accent py-5 shadow-[inset_4px_0_0_var(--primary)]",
								)}
							>
								{item.badge ? (
									<span className="price-tag absolute right-3 top-0 -translate-y-1/2 font-sans text-[0.66rem] font-bold">
										{item.badge}
									</span>
								) : null}
								<div className="flex items-center gap-3">
									<MarketMark accent={item.accent}>{item.mark}</MarketMark>
									<span className="font-semibold text-foreground">
										{item.supermarket}
									</span>
								</div>
								<p className={cn("price whitespace-nowrap text-xl md:text-lg", index === 0 ? "text-primary md:text-xl" : "text-foreground")}>
									{item.total}
								</p>
								<p
									className={cn(
										"text-xs font-medium",
										item.status === "Falta 1"
											? "text-warning" : "text-primary", )} > {item.coverage}
								</p>
								<p
									className={cn(
										"inline-flex items-center gap-2 text-xs",
										item.status === "Falta 1" ? "text-warning" : "text-primary", )} > {item.status === "Falta 1" ? (
										<WarningIcon className="size-4" />
									) : (
										<CheckIcon className="size-4" />
									)}
									{item.status}
								</p>
							</div>
						))}
					</div>
				</div>
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-3/60 px-4 py-2.5 text-xs text-muted-foreground">
				<BarsIcon className="size-4 text-foreground" aria-hidden="true" />
				<span>{SMART_BASKET.note}</span>
				<Link
					href="/metodologia"
					className="inline-flex min-h-11 items-center font-semibold text-primary hover:underline" > Ver metodología
				</Link>
			</div>
		</aside>
	);
}

function ProductRowsPreview() {
	return (
		<section
			className="surface min-w-0 p-4 sm:p-6 lg:p-7"
			aria-labelledby="product-preview-title"
		>
			<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
				<div className="flex flex-wrap items-baseline gap-3">
					<h2
						id="product-preview-title"
						className="text-2xl font-bold text-foreground"
					>
						Ejemplo de precios por producto
					</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Estos precios son ejemplos ilustrativos; no son precios actuales.
					</p>
					<p className="text-xs font-medium text-muted-foreground">
						4 productos de ejemplo
					</p>
				</div>
			</div>

			<div className="overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border"> <div className="hidden grid-cols-[1.55fr_0.75fr_0.85fr_0.95fr_0.9fr_0.55fr] gap-4 border-b-2 border-dashed border-border bg-surface-1 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
					<span>Producto</span>
					<span>Precio mínimo</span>
					<span>Supermercado</span>
					<span>Rango de precios</span>
					<span>Referencia</span>
					<span>Acción</span>
				</div>
				<div className="stagger divide-y divide-border"> {HOME_PRODUCT_ROWS.map((row) => (
						<article
							key={row.product}
							className="grid gap-3 px-4 py-3 md:grid-cols-[1.55fr_0.75fr_0.85fr_0.95fr_0.9fr_0.55fr] md:items-center md:gap-4"
						>
							<div className="flex min-w-0 items-center gap-4">
								<ProductThumb
									label={row.shortLabel}
									tone={row.tone}
									size="sm"
								/>
								<div className="min-w-0">
									<h3 className="truncate text-sm font-semibold text-foreground">
										{row.product}
									</h3>
									<p className="truncate text-xs text-muted-foreground">
										{row.brand}
									</p>
								</div>
							</div>
							<p className="price text-2xl text-primary"> {row.minPrice}
							</p>
							<div className="flex items-center gap-2 text-sm font-medium text-foreground">
								<MarketMark
									accent={row.supermarket === "Carrefour" ? "blue" : "green"}
								>
									{row.supermarket === "Carrefour" ? "C" : "Vea"}
								</MarketMark>
								{row.supermarket}
							</div>
							<p className="font-mono text-xs tabular-nums text-muted-foreground">{row.range}</p>
							<p className="text-xs text-muted-foreground">{row.updatedAt}</p>
							<Link
								href={`/buscar?q=${encodeURIComponent(row.product)}`}
								aria-label={`Buscar producto: ${row.product}`}
								className="press inline-flex min-h-11 w-fit items-center rounded-lg border border-primary/50 px-3.5 text-xs font-semibold text-primary [transition:background-color_200ms_var(--ease-out),color_200ms_var(--ease-out),transform_160ms_var(--ease-out)] hover:bg-primary hover:text-primary-foreground"
							>
								{row.action}
							</Link>
						</article>
					))}
				</div>
			</div>

			<div className="mt-5 flex justify-center">
				<Link
					href="/buscar"
					className="press inline-flex min-h-11 items-center rounded-lg bg-primary px-8 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
				>
					Abrir búsqueda de productos
				</Link>
			</div>
		</section>
	);
}

function MarketPulse() {
	return (
		<aside
			className="surface min-w-0 p-4 sm:p-6 lg:p-7"
			aria-labelledby="market-pulse-title"
		>
			<div className="mb-5 flex items-center justify-between gap-3">
				<h2
					id="market-pulse-title"
					className="text-2xl font-bold text-foreground"
				>
					Ejemplos de lectura del catálogo
				</h2>
				<Link
					href="/ofertas"
					className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline"
				>
					Ver ofertas disponibles
				</Link>
			</div>

			<div className="stagger space-y-3"> {MARKET_PULSE_ITEMS.map((item) => (
					<article
						key={item.title}
						className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 rounded-xl bg-surface-1 p-4"
					>
						<Sparkline points={item.points} tone={item.tone} />
						<div>
							<h3 className="text-sm font-semibold text-foreground">
								{item.title}
							</h3>
							<p className="mt-1 text-xs leading-5 text-muted-foreground">
								{item.description}
							</p>
						</div>
						<p
							className={cn(
								"price text-xl", pulseValueClasses[item.tone],
							)}
						>
							{item.value}
						</p>
					</article>
				))}
			</div>

			<div className="mt-5 flex items-center gap-2 border-t-2 border-dashed border-border pt-4 text-xs text-muted-foreground">
				<ClockIcon className="size-4 text-foreground" aria-hidden="true" />
				Las líneas son ilustrativas y no representan una serie observada.
			</div>
		</aside>
	);
}

function ProductThumb({
	label,
	tone,
	size = "md",
}: {
	label: string;
	tone: ProductTone;
	size?: "sm" | "md";
}) {
	return (
		<div
			className={cn(
				"relative flex shrink-0 items-center justify-center overflow-hidden rounded-md border shadow-[var(--elevation-1)]",
				size === "sm" ? "h-12 w-9" : "h-[4.2rem] w-12",
				productToneClasses[tone],
			)}
			aria-hidden="true"
		>
			<span className="absolute inset-x-1 top-1 h-2 rounded-sm bg-background/60" />
			<span className="font-mono text-[0.62rem] font-bold tracking-tight">
				{label}
			</span>
			<span className="absolute inset-x-2 bottom-1 h-1 rounded-full bg-current/30" />
		</div>
	);
}

function MarketMark({
	accent,
	children,
}: {
	accent: RankingAccent;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-black",
				marketMarkClasses[accent],
			)}
		>
			{children}
		</span>
	);
}

function Sparkline({ points, tone }: { points: string; tone: PulseTone }) {
	const color = tone === "amber" ? "var(--warning)" : "var(--primary)";

	return (
		<svg viewBox="0 0 80 48" className="h-12 w-20" aria-hidden="true">
			<polyline
				fill="none"
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				points={points}
			/>
			{points.split(" ").map((point) => {
				const [cx, cy] = point.split(",");
				return <circle key={point} cx={cx} cy={cy} r="2" fill={color} />;
			})}
		</svg>
	);
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="11" cy="11" r="7" />
			<path d="m20 20-3.5-3.5" />
		</svg>
	);
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" {...props}>
			<circle cx="12" cy="12" r="9" />
			<path
				d="m8.6 12.2 2.1 2.1 4.8-5"
				fill="none"
				stroke="var(--primary-foreground)"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function WarningIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M12 4 3.5 19h17L12 4Z" />
			<path d="M12 9v4" />
			<path d="M12 17h.01" />
		</svg>
	);
}

function BarsIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<path d="M6 20V10" />
			<path d="M12 20V4" />
			<path d="M18 20v-7" />
		</svg>
	);
}

function ClockIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3 2" />
		</svg>
	);
}
