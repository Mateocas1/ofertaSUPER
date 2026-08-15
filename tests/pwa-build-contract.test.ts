import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("keeps the Next 16 PWA build on Webpack with explicit Workbox update and fallback behavior", async () => {
  const [packageJson, nextConfig] = await Promise.all([read("package.json"), read("next.config.ts")]);
  const packageData = JSON.parse(packageJson) as { scripts: Record<string, string> };

  assert.equal(packageData.scripts.build, "next build --webpack");
  assert.match(nextConfig, /dest:\s*["']public["']/);
  assert.match(nextConfig, /register:\s*true/);
  assert.match(nextConfig, /reloadOnOnline:\s*true/);
  assert.match(nextConfig, /cacheOnFrontEndNav:\s*true/);
  assert.match(nextConfig, /fallbacks:\s*{[\s\S]*?document:\s*["']\/~offline["'],?[\s\S]*?}/);
  assert.match(nextConfig, /workboxOptions:\s*{[\s\S]*?skipWaiting:\s*true,[\s\S]*?clientsClaim:\s*true,[\s\S]*?cleanupOutdatedCaches:\s*true,?[\s\S]*?}/);
});

test("keeps the install manifest and offline fallback route", async () => {
  const [manifestSource, offlinePage] = await Promise.all([read("public/manifest.json"), read("src/app/~offline/page.tsx")]);
  const manifest = JSON.parse(manifestSource) as {
    display: string;
    icons: Array<{ src: string }>;
    name: string;
    start_url: string;
  };

  assert.equal(manifest.name, "ofertasSUPER");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.deepEqual(manifest.icons.map(({ src }) => src), ["/icon-192.svg", "/icon-512.svg"]);
  assert.match(offlinePage, /No hay conexion disponible\./);
});

test("keeps representative product images unoptimized", async () => {
  const componentPaths = [
    "src/components/product-card.tsx",
    "src/components/search-bar.tsx",
    "src/components/canasta-page.tsx",
  ];
  const components = await Promise.all(componentPaths.map(read));

  for (const component of components) {
    assert.match(component, /<Image\s+src=[\s\S]*?\bunoptimized\s*\/>/);
  }
});
