import type { Metadata } from "next";
import Link from "next/link";

import { HomeBasket } from "@/components/home/home-basket";
import { HomeDrops, homeDropsActionLabel } from "@/components/home/home-drops";
import { HomeHero } from "@/components/home/home-hero";
import { loadHomeDrops, loadHomeSnapshotData, type HomeDropsData } from "@/lib/home-catalog";
import { HOME_PRICE_DROPS } from "@/lib/home-ui-data";
import { PRICE_DROPS_FEED_PATH } from "@/lib/price-drops-feed";
import { buildAbsoluteUrl } from "@/lib/seo/metadata";

// ISR: the home re-renders at most every 6 hours, so the basket is priced and
// its freshness judged once per render, never per request.
export const revalidate = 21600;

// The home page offers the price-drops feed as an alternate representation, so
// a reader (or a browser) finds it without visiting /bajas first.
export const metadata: Metadata = {
	alternates: {
		types: {
			"application/atom+xml": [{ url: buildAbsoluteUrl(PRICE_DROPS_FEED_PATH), title: HOME_PRICE_DROPS.title }],
		},
	},
};

// The page and the feed of every drop, next to the few the home shows.
function DropsActions({ data }: { data: HomeDropsData }) {
	if (data.status === "unavailable") return null;
	return (
		<div className="flex items-center gap-x-4">
			<a
				href={PRICE_DROPS_FEED_PATH}
				type="application/atom+xml"
				className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground hover:underline"
			>
				{HOME_PRICE_DROPS.feedLabel}
			</a>
			<Link href="/bajas" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">
				{homeDropsActionLabel(data)}
			</Link>
		</div>
	);
}

export default function Home() {
	const snapshot = loadHomeSnapshotData();
	const drops = loadHomeDrops();

	return (
		<div className="container-page flex flex-col gap-10 pb-14 pt-8 md:gap-12 md:pt-10">
			<HomeHero data={snapshot} />
			<div className="grid gap-10 lg:grid-cols-12 lg:gap-8">
				<div className="min-w-0 lg:col-span-7">
					<HomeDrops data={drops} actions={<DropsActions data={drops} />} />
				</div>
				<div className="min-w-0 lg:col-span-5">
					<HomeBasket data={snapshot} />
				</div>
			</div>
		</div>
	);
}
