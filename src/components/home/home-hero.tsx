import Link from "next/link";
import { Search } from "lucide-react";

import type { HomeSnapshotData } from "@/lib/home-catalog";
import { HOME_HERO, provenanceLine } from "@/lib/home-ui-data";

function SearchForm() {
	return (
		<form action="/buscar" role="search" aria-label="Buscar productos" className="flex w-full max-w-2xl gap-2">
			<label htmlFor="home-search" className="sr-only">
				{HOME_HERO.searchLabel}
			</label>
			<div className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-card px-3 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/30">
				<Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<input
					id="home-search"
					name="q"
					type="search"
					placeholder={HOME_HERO.searchPlaceholder}
					autoComplete="off"
					className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
				/>
			</div>
			<button
				type="submit"
				className="press min-h-12 shrink-0 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
			>
				{HOME_HERO.searchAction}
			</button>
		</form>
	);
}

function QuickSearches() {
	return (
		<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
			<span className="text-sm text-muted-foreground">{HOME_HERO.quickSearchesLabel}</span>
			<ul className="flex flex-wrap gap-2">
				{HOME_HERO.quickSearches.map((search) => (
					<li key={search}>
						<Link
							href={`/buscar?q=${encodeURIComponent(search)}`}
							className="press inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 text-sm text-foreground hover:border-foreground/30"
						>
							{search}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}

function Provenance({ data }: { data: HomeSnapshotData }) {
	if (data.status === "unavailable") {
		return <p className="text-sm text-muted-foreground" role="status">{HOME_HERO.unavailable}</p>;
	}
	const { generatedAt, supermarkets, productCount } = data.provenance;
	return (
		<p className="text-sm tabular-nums text-muted-foreground">
			<time dateTime={generatedAt}>{provenanceLine(generatedAt, supermarkets, productCount)}</time>
		</p>
	);
}

export function HomeHero({ data }: { data: HomeSnapshotData }) {
	return (
		<section aria-labelledby="home-title" className="flex flex-col gap-5 border-b border-border pb-8 md:pb-10">
			<div className="flex max-w-3xl flex-col gap-3">
				<h1
					id="home-title"
					className="font-display text-4xl font-extrabold leading-tight tracking-tight text-foreground md:text-5xl"
				>
					{HOME_HERO.heading}
				</h1>
				<p className="max-w-2xl text-base text-muted-foreground md:text-lg">{HOME_HERO.body}</p>
			</div>
			<SearchForm />
			<QuickSearches />
			<Provenance data={data} />
		</section>
	);
}
