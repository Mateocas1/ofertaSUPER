import type { ReactNode } from "react";
import Link from "next/link";

import { DropThumb } from "@/components/home/drop-thumb";
import { formatCurrency, formatDiscountPercent } from "@/lib/format";
import type { HomeDropsData } from "@/lib/home-catalog";
import { HOME_PRICE_DROPS, dropsActionLabel, observedLabel } from "@/lib/home-ui-data";
import type { PriceDrop } from "@/lib/price-drops";
import { storeLabel } from "@/lib/price-drops";
import { canonicalProductPath } from "@/lib/seo/metadata";

function DropPrices({ drop }: { drop: PriceDrop }) {
	return (
		<div className="flex flex-col items-end gap-0.5 text-right">
			<p className="price text-base text-foreground">{formatCurrency(drop.currentPrice)}</p>
			<p className="text-xs tabular-nums text-muted-foreground">
				{HOME_PRICE_DROPS.previousPrice} <s>{formatCurrency(drop.previousPrice)}</s>
			</p>
			<p className="text-xs font-semibold tabular-nums text-primary">
				{HOME_PRICE_DROPS.dropped} {formatDiscountPercent(drop.percentDrop, 1)}
			</p>
		</div>
	);
}

function DropRow({ drop }: { drop: PriceDrop }) {
	return (
		<li>
			<Link
				href={canonicalProductPath(drop.ean)}
				className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none md:px-5"
			>
				<DropThumb src={drop.imageUrl} />
				<div className="min-w-0">
					<p className="line-clamp-2 text-sm font-medium text-foreground group-hover:underline">{drop.name}</p>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{storeLabel(drop.source)} · <time dateTime={drop.observedAt}>{observedLabel(drop.observedAt)}</time>
					</p>
				</div>
				<DropPrices drop={drop} />
			</Link>
		</li>
	);
}

function DropsBody({ data }: { data: HomeDropsData }) {
	if (data.status === "unavailable") {
		return <p className="surface p-4 text-sm text-muted-foreground md:p-5" role="status">{HOME_PRICE_DROPS.unavailable}</p>;
	}
	if (data.status === "empty") {
		return <p className="surface p-4 text-sm text-muted-foreground md:p-5">{HOME_PRICE_DROPS.empty}</p>;
	}
	return (
		<ul className="surface divide-y divide-border overflow-hidden">
			{data.drops.map((drop) => (
				<DropRow key={`${drop.ean}:${drop.source}`} drop={drop} />
			))}
		</ul>
	);
}

/** Label of the link to /bajas: the published count when there is one. */
export function homeDropsActionLabel(data: HomeDropsData): string {
	return data.status === "ready" ? dropsActionLabel(data.publishedCount) : HOME_PRICE_DROPS.action;
}

export function HomeDrops({ data, actions }: { data: HomeDropsData; actions: ReactNode }) {
	return (
		<section aria-labelledby="home-drops-title" className="flex min-w-0 flex-col gap-4">
			<div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
				<div>
					<h2 id="home-drops-title" className="text-2xl font-bold text-foreground">
						{HOME_PRICE_DROPS.title}
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">{HOME_PRICE_DROPS.body}</p>
				</div>
				{actions}
			</div>
			<DropsBody data={data} />
		</section>
	);
}
