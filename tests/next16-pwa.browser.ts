import { expect, test } from "@playwright/test";

test("registers an updatable Workbox service worker and exposes the install manifest", async ({ page }) => {
  await page.goto("/");

  const manifest = await page.request.get("/manifest.json");
  await expect(manifest).toBeOK();
  const manifestData = (await manifest.json()) as { icons: Array<{ src: string }> };

  await expect(manifestData).toMatchObject({
    display: "standalone",
    name: "ofertasSUPER",
    start_url: "/",
  });
  expect(manifestData.icons).toEqual(
    expect.arrayContaining([expect.objectContaining({ src: "/icon-192.svg" }), expect.objectContaining({ src: "/icon-512.svg" })]),
  );

  const icon = await page.request.get("/icon-192.svg");
  await expect(icon).toBeOK();
  expect(new URL(icon.url()).pathname).toBe("/icon-192.svg");

  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cacheNames = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return caches.keys();
  });

  expect(cacheNames.some((name: string) => name.includes("workbox-precache"))).toBe(true);
});

test("does not retain catalog navigation in a service-worker cache", async ({ page }) => {
  await page.goto("/");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  for (const path of ["/buscar?q=yerba", "/ofertas"]) {
    await page.goto(path);
    await expect(page.getByText(/datos de demostración/i)).toHaveCount(0);
  }

  const catalogEntries = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const entries = await Promise.all(cacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    }));
    return entries.flat().filter((pathname) => pathname === "/buscar" || pathname === "/ofertas");
  });

  expect(catalogEntries).toEqual([]);
});

test("serves the offline fallback when a cached document request fails", async ({ context, page }) => {
  await page.goto("/");
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const hasOfflineFallback = await page.evaluate(async () => Boolean(await caches.match("/~offline", { ignoreSearch: true })));

  expect(hasOfflineFallback).toBe(true);

  await context.route("**/ofertas", async (route) => {
    if (route.request().serviceWorker()) {
      await route.abort("failed");
      return;
    }

    await route.continue();
  });
  try {
    await page.goto("/ofertas");
    await expect(page.getByRole("heading", { name: "No hay conexion disponible." })).toBeVisible();
  } finally {
    await context.unroute("**/ofertas");
  }
});
