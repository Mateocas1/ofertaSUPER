// Gate 6 top-up scheduling, kept free of the database so it is unit-testable.
// The reads are pure network and each source is its own host, so the three
// sources are read at the same time (each source keeps its own sequential
// pace and delay, so no store sees more traffic than before). The writes are
// not parallel: Disco and Jumbo share EANs, so staging and reconciling them
// at once could race on the same product rows. The caller writes the sources
// one after another once every read is done.

export type TopUpOfferRef = { product_ean: string; name: string };

export type SourceReads<Read> = {
  slug: string;
  reads: Array<{ offer: TopUpOfferRef; read: Read }>;
  readsOk: number;
  readsFailed: number;
  elapsedMs: number;
};

export async function readSourceOffers<Read extends { ok: boolean }>({
  slug,
  offers,
  readOffer,
  delayMs,
  sleep,
  now = Date.now,
}: {
  slug: string;
  offers: TopUpOfferRef[];
  readOffer: (ean: string) => Promise<Read>;
  delayMs: number;
  sleep: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<SourceReads<Read>> {
  const startedAt = now();
  const reads: SourceReads<Read>["reads"] = [];
  let readsOk = 0;
  let readsFailed = 0;
  for (const offer of offers) {
    const read = await readOffer(offer.product_ean);
    if (read.ok) {
      readsOk += 1;
      reads.push({ offer, read });
    } else {
      readsFailed += 1;
    }
    await sleep(delayMs);
  }
  return { slug, reads, readsOk, readsFailed, elapsedMs: now() - startedAt };
}

// Every source is read concurrently; results come back in the sources' order
// so the writes (and the summary) stay deterministic.
export async function readAllSources<Read extends { ok: boolean }>(
  sources: Array<{ slug: string; offers: TopUpOfferRef[] }>,
  read: (source: { slug: string; offers: TopUpOfferRef[] }) => Promise<SourceReads<Read>>,
): Promise<Array<SourceReads<Read>>> {
  return Promise.all(sources.map((source) => read(source)));
}
