import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { setSnapshotOverrideForTests } from "../src/lib/catalog-snapshot";
import { loadHomeSnapshotData } from "../src/lib/home-catalog";
import { installSnapshotFixture } from "./helpers/snapshot-fixture";

// The home reads only committed files (the snapshot and the basket index), no
// database, like every other snapshot route. CATALOG_OFFLINE_MODE means "no
// database", so it must not hide the catalog: on 19/11/2026 the production
// build ran with it and prerendered "/" as unavailable while /ofertas,
// /producto and the sitemap served the same snapshot.
describe("home snapshot data", () => {
	const previous = process.env.CATALOG_OFFLINE_MODE;
	const fixture = installSnapshotFixture();

	after(() => {
		setSnapshotOverrideForTests(null);
		if (previous === undefined) delete process.env.CATALOG_OFFLINE_MODE;
		else process.env.CATALOG_OFFLINE_MODE = previous;
	});

	it("renders the snapshot when the database is offline", () => {
		process.env.CATALOG_OFFLINE_MODE = "true";
		const data = loadHomeSnapshotData(new Date(fixture.generatedAt));
		assert.equal(data.status, "ready");
		if (data.status !== "ready") return;
		assert.equal(data.provenance.generatedAt, fixture.generatedAt);
		assert.equal(data.provenance.productCount, fixture.products.length);
	});

	it("renders the snapshot without offline mode", () => {
		delete process.env.CATALOG_OFFLINE_MODE;
		assert.equal(loadHomeSnapshotData(new Date(fixture.generatedAt)).status, "ready");
	});

	it("still fails closed when the snapshot is unreadable", () => {
		setSnapshotOverrideForTests({ ...fixture, products: undefined } as unknown as typeof fixture);
		try {
			assert.deepEqual(loadHomeSnapshotData(new Date(fixture.generatedAt)), { status: "unavailable" });
		} finally {
			setSnapshotOverrideForTests(fixture);
		}
	});
});
