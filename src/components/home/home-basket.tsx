import Link from "next/link";
import { Check } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import type { HomeBasket as HomeBasketData, HomeBasketLine, HomeBasketStore } from "@/lib/home-basket";
import type { HomeSnapshotData } from "@/lib/home-catalog";
import { HOME_BASKET, basketCoverageParts, basketMissingLabel, basketSizeLabel, observedLabel } from "@/lib/home-ui-data";
import { cn } from "@/lib/utils";

function StandingLabel({ store }: { store: HomeBasketStore }) {
	if (store.standing === "cheapest-complete") {
		return (
			<span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-primary">
				<Check className="size-3.5" aria-hidden="true" />
				{HOME_BASKET.cheapestComplete}
			</span>
		);
	}
	if (store.standing === "complete") {
		return <span className="text-xs text-muted-foreground">{HOME_BASKET.complete}</span>;
	}
	return <span className="whitespace-nowrap text-xs text-muted-foreground">{basketMissingLabel(store.missing)}</span>;
}

function CoverageCell({ covered, itemCount }: { covered: number; itemCount: number }) {
	const { ratio, noun } = basketCoverageParts(covered, itemCount);
	return (
		<>
			{ratio}
			<span className="sr-only sm:not-sr-only"> {noun}</span>
		</>
	);
}

function StoreRow({ store, itemCount }: { store: HomeBasketStore; itemCount: number }) {
	const best = store.standing === "cheapest-complete";
	const incomplete = store.standing === "incomplete";

	return (
		<tr className={cn(best && "bg-accent/60")}>
			<th scope="row" className="px-4 py-3 text-left font-normal md:px-5">
				<span className="block text-sm font-medium text-foreground">{store.name}</span>
				<StandingLabel store={store} />
			</th>
			<td className="px-2 py-3 text-right text-sm tabular-nums text-muted-foreground">
				<CoverageCell covered={store.covered} itemCount={itemCount} />
			</td>
			<td
				className={cn(
					"price px-4 py-3 text-right text-base md:px-5",
					incomplete ? "text-muted-foreground" : "text-foreground",
				)}
			>
				{store.covered > 0 ? formatCurrency(store.total) : "—"}
			</td>
		</tr>
	);
}

function StoresTable({ basket }: { basket: HomeBasketData }) {
	return (
		<table className="w-full border-collapse">
			<caption className="sr-only">{HOME_BASKET.title}</caption>
			<thead>
				<tr className="border-b border-border text-xs font-medium text-muted-foreground">
					<th scope="col" className="px-4 py-2 text-left font-medium md:px-5">{HOME_BASKET.columns.store}</th>
					<th scope="col" className="px-2 py-2 text-right font-medium">{HOME_BASKET.columns.coverage}</th>
					<th scope="col" className="px-4 py-2 text-right font-medium md:px-5">{HOME_BASKET.columns.total}</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-border">
				{basket.stores.map((store) => (
					<StoreRow key={store.slug} store={store} itemCount={basket.itemCount} />
				))}
			</tbody>
		</table>
	);
}

function LineItem({ line }: { line: HomeBasketLine }) {
	return (
		<li className="flex items-baseline justify-between gap-3 py-2 text-sm">
			<span className="min-w-0 text-foreground">{line.label}</span>
			{line.cheapestPrice === null ? (
				<span className="shrink-0 text-xs text-muted-foreground">{HOME_BASKET.noPrice}</span>
			) : (
				<span className="shrink-0 text-right">
					<span className="price text-foreground">{formatCurrency(line.cheapestPrice)}</span>
					<span className="block text-xs text-muted-foreground">{line.cheapestStores.join(", ")}</span>
				</span>
			)}
		</li>
	);
}

function BasketNote({ basket }: { basket: HomeBasketData }) {
	if (basket.cheapestComplete === null) return <p className="text-sm text-muted-foreground">{HOME_BASKET.noComplete}</p>;
	if (basket.stores.some((store) => store.standing === "incomplete")) {
		return <p className="text-sm text-muted-foreground">{HOME_BASKET.incompleteNote}</p>;
	}
	return null;
}

function PricedBasket({ basket }: { basket: HomeBasketData }) {
	return (
		<div className="surface overflow-hidden">
			<StoresTable basket={basket} />
			<div className="flex flex-col gap-3 border-t border-border px-4 py-3 md:px-5">
				<BasketNote basket={basket} />
				<details className="group">
					<summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-foreground hover:underline">
						{HOME_BASKET.linesSummary}
					</summary>
					<ul className="divide-y divide-border">
						{basket.lines.map((line) => (
							<LineItem key={line.gtin14} line={line} />
						))}
					</ul>
				</details>
			</div>
		</div>
	);
}

function BasketBody({ data }: { data: HomeSnapshotData }) {
	if (data.status === "unavailable") {
		return <p className="surface p-4 text-sm text-muted-foreground md:p-5" role="status">{HOME_BASKET.unavailable}</p>;
	}
	if (data.basket.freshPriceCount === 0) {
		return <p className="surface p-4 text-sm text-muted-foreground md:p-5">{HOME_BASKET.staleOnly}</p>;
	}
	return <PricedBasket basket={data.basket} />;
}

function BasketMeta({ data }: { data: HomeSnapshotData }) {
	if (data.status === "unavailable") return null;
	const { itemCount, latestObservedAt } = data.basket;
	return (
		<p className="mt-1 text-xs tabular-nums text-muted-foreground">
			{basketSizeLabel(itemCount)}
			{latestObservedAt ? (
				<>
					{" · "}
					<time dateTime={latestObservedAt}>{observedLabel(latestObservedAt)}</time>
				</>
			) : null}
		</p>
	);
}

export function HomeBasket({ data }: { data: HomeSnapshotData }) {
	return (
		<section aria-labelledby="home-basket-title" className="flex min-w-0 flex-col gap-4">
			<div>
				<h2 id="home-basket-title" className="text-2xl font-bold text-foreground">
					{HOME_BASKET.title}
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">{HOME_BASKET.body}</p>
				<BasketMeta data={data} />
			</div>
			<BasketBody data={data} />
			<div className="flex flex-col gap-1">
				{data.status === "ready" ? <p className="text-xs text-muted-foreground">{HOME_BASKET.footnote}</p> : null}
				<div className="flex flex-wrap gap-x-5">
					<Link href="/inflacion" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
						{HOME_BASKET.methodLink}
					</Link>
					<Link href="/canasta" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
						{HOME_BASKET.ownBasketLink}
					</Link>
				</div>
			</div>
		</section>
	);
}
