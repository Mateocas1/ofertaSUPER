import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
	await context.route("**/*", async (route) => {
		const { hostname } = new URL(route.request().url());
		if (hostname === "127.0.0.1") return route.continue();
		return route.abort();
	});
});

// The home is ISR: whether its snapshot-backed parts render prices or the
// unavailable state depends on the environment of the build that prerendered
// it. Either is honest; demo or illustrative content never is.
const BASKET_STATE = /\d+ de \d+|no está disponible|más de 24 horas/;

test("search form and all quick searches go to the search page", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
	const search = page.getByRole("search", { name: "Buscar productos" });
	await search.getByRole("searchbox").fill("leche");
	await search.getByRole("button", { name: "Buscar" }).click();
	await expect(page).toHaveURL(/\/buscar\?q=leche/);

	for (const query of ["leche", "yerba", "arroz", "aceite"]) {
		await page.goto("/");
		await page.getByRole("link", { name: query, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/buscar\\?q=${query}`));
	}
});

test("home shows real drops and the basket honestly on mobile, with no illustrative content", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });

	await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
	await expect(page.getByRole("heading", { name: "Bajaron de precio" })).toBeVisible();
	const drops = page.locator("section[aria-labelledby=home-drops-title] a[href^='/producto/']");
	expect(await drops.count()).toBeGreaterThan(0);
	await expect(drops.first()).toContainText("Bajó");

	const basket = page.locator("section[aria-labelledby=home-basket-title]");
	await expect(basket.getByRole("heading", { name: "Canasta básica" })).toBeVisible();
	await expect(basket).toContainText(BASKET_STATE);

	await expect(page.getByText(/ilustrativ|ejemplo/i)).toHaveCount(0);
	expect(await page.locator("body").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test("header navigation reaches every section and returns home", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const nav = page.getByRole("navigation", { name: "Principal" });
	// Each destination is checked by URL and by its one H1, so a broken page
	// cannot pass as a navigation.
	const destinations = [
		["Buscar", /\/buscar$/, "Buscá un producto"],
		["Ofertas", /\/ofertas/, "Ofertas"],
		["Bajas", /\/bajas$/, "Bajas de precio"],
		["Inflación", /\/inflacion$/, "Inflación por producto"],
	] as const;

	for (const [name, url, heading] of destinations) {
		await page.goto("/");
		await nav.getByRole("link", { name, exact: true }).click();
		await expect(page).toHaveURL(url);
		await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
		await page.getByRole("link", { name: "ofertasSUPER, inicio" }).click();
		await expect(page).toHaveURL(/\/$/);
	}

	await page.getByRole("link", { name: /^Canasta/ }).first().click();
	await expect(page).toHaveURL(/\/canasta$/);
	await expect(page.getByRole("heading", { level: 1, name: "Todavía no agregaste productos" })).toBeVisible();
});

test("each home link performs its stated navigation", async ({ page }) => {
	await page.goto("/");
	const firstDrop = page.locator("section[aria-labelledby=home-drops-title] a[href^='/producto/']").first();
	const href = await firstDrop.getAttribute("href");
	await firstDrop.focus();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL((url) => url.pathname === href, { timeout: 30_000 });

	await page.goto("/");
	await page.getByRole("link", { name: /^Ver (las \d+ bajas|la baja|todas las bajas)$/ }).click();
	await expect(page).toHaveURL(/\/bajas$/);

	await page.goto("/");
	await expect(page.getByRole("link", { name: "Feed Atom", exact: true })).toHaveAttribute("href", "/bajas/feed.xml");

	await page.getByRole("link", { name: "Cómo evoluciona esta canasta" }).click();
	await expect(page).toHaveURL(/\/inflacion$/);
	await page.goto("/");
	await page.getByRole("link", { name: "Armá tu propia canasta" }).click();
	await expect(page).toHaveURL(/\/canasta$/);
});
