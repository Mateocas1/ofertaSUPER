import { expect, test } from "@playwright/test";

test.beforeEach(async ({ context }) => {
	await context.route("**/*", async (route) => {
		const { hostname } = new URL(route.request().url());
		if (hostname === "127.0.0.1") return route.continue();
		return route.abort();
	});
});

test("search form and all quick searches retain unavailable-catalog recovery", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 900 });
	await page.goto("/");
	await page.screenshot({ path: "test-results/os02-desktop-example.png", fullPage: true });
	const search = page.getByRole("search", { name: "Buscar productos" });
	await search.getByRole("searchbox").fill("leche");
	await search.getByRole("button", { name: "Buscar" }).click();
	await expect(page).toHaveURL(/\/buscar\?q=leche/);
	await expect(page.locator("section[role=alert]")).toContainText("El catálogo no está disponible.");
	await page.screenshot({ path: "test-results/os02-desktop-unavailable.png", fullPage: true });

	for (const query of ["leche", "yerba", "arroz", "aceite"]) {
		await page.goto("/");
		await page.getByRole("link", { name: query, exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`/buscar\\?q=${query}`));
		await expect(page.locator("section[role=alert]")).toContainText("No podemos mostrar resultados reales");
	}
});

test("home labels static examples and the offers recovery honestly on mobile", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.screenshot({ path: "test-results/os02-mobile-example.png", fullPage: true });
	await expect(page.getByRole("heading", { name: "Canasta ilustrativa" })).toBeVisible();
	await expect(page.getByText("Ejemplo · 4 productos").first()).toBeVisible();
	await expect(page.getByText("Ejemplo de precios por producto")).toBeVisible();
	await expect(page.getByText("Estos precios son ejemplos ilustrativos; no son precios actuales.")).toBeVisible();
	await expect(page.getByText("Las líneas son ilustrativas y no representan una serie observada.")).toBeVisible();
	expect(await page.locator("body").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

	await page.getByRole("link", { name: "Buscar", exact: true }).click();
	await expect(page).toHaveURL(/\/buscar$/);
	await expect(page.getByRole("heading", { name: "Encontrá el producto exacto" })).toBeVisible();
	await page.getByRole("link", { name: "Inicio", exact: true }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("heading", { name: "Compará precios. Armá tu canasta. Comprá mejor." })).toBeVisible();
	await page.getByRole("link", { name: "Ofertas", exact: true }).click();
	await expect(page).toHaveURL(/\/ofertas/);
	await expect(page.getByRole("heading", { name: "Promos manuales y descuentos detectados" })).toBeVisible();
	await page.getByRole("link", { name: "Canasta", exact: true }).click();
	await expect(page).toHaveURL(/\/canasta/);
	await expect(page.getByRole("heading", { name: "Todavia no agregaste productos." })).toBeVisible();
	await page.getByRole("link", { name: "Inicio", exact: true }).click();
	await expect(page).toHaveURL(/\/$/);

	await page.getByRole("link", { name: "Ver ofertas disponibles" }).click();
	await expect(page).toHaveURL(/\/ofertas/);
	await expect(page.locator("section[role=alert]")).toContainText("El catálogo no está disponible.");
	await page.screenshot({ path: "test-results/os02-mobile-unavailable.png", fullPage: true });
});

test("each product action and linked destination performs its stated navigation", async ({ page }) => {
	await page.goto("/");
	const products = ["Leche entera 1L", "Yerba mate 1kg", "Arroz largo fino 1kg", "Aceite girasol 1,5L"] as const;

	for (const [index, product] of products.entries()) {
		const link = page.getByRole("link", { name: `Buscar producto: ${product}` });
		const href = `/buscar?q=${encodeURIComponent(product)}`;
		await expect(link).toHaveAttribute("href", href);
		if (index === 0) {
			await link.focus();
			await page.keyboard.press("Enter");
		} else {
			await link.click();
		}
		await expect(page).toHaveURL((url) => url.pathname === "/buscar" && url.searchParams.get("q") === product);
		await expect(page.locator("section[role=alert]")).toContainText("El catálogo no está disponible.");
		await page.goto("/");
	}

	await page.getByRole("link", { name: "Abrir canasta" }).click();
	await expect(page).toHaveURL(/\/canasta/);
	await page.goto("/");
	await page.getByRole("link", { name: "Abrir búsqueda de productos" }).click();
	await expect(page).toHaveURL(/\/buscar$/);
	await page.goto("/");
	await page.getByRole("link", { name: "Ver metodología" }).click();
	await expect(page).toHaveURL(/\/metodologia/);
});
