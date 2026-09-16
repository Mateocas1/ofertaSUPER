import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("builds and registers a production Serwist worker without caching catalog routes", async () => {
  const [packageJson, config, worker, layout] = await Promise.all([
    read("package.json"),
    read("serwist.config.js"),
    read("src/app/sw.ts"),
    read("src/app/layout.tsx"),
  ]);
  const packageData = JSON.parse(packageJson) as {
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(
    packageData.scripts.build,
    "prisma generate && tsx scripts/build-catalog-contract.ts prebuild && next build --webpack && serwist build && tsx scripts/build-catalog-contract.ts package",
  );
  assert.deepEqual(
    Object.fromEntries(["@serwist/next", "@serwist/cli", "serwist", "esbuild"].map((name) => [name, packageData.devDependencies[name]])),
    { "@serwist/next": "9.5.12", "@serwist/cli": "9.5.12", serwist: "9.5.12", esbuild: "0.28.2" },
  );
  assert.doesNotMatch(packageJson, /@ducanh2912\/next-pwa/);
  assert.match(config, /swSrc:\s*["']src\/app\/sw\.ts["']/);
  assert.match(config, /swDest:\s*["']public\/sw\.js["']/);
  assert.match(worker, /precacheEntries:\s*self\.__SW_MANIFEST/);
  assert.match(worker, /skipWaiting:\s*true/);
  assert.match(worker, /clientsClaim:\s*true/);
  assert.match(worker, /entries:\s*\[\{ matcher: \(\{ request \}\) => request\.destination === "document", url: "\/~offline" }\]/);
  assert.match(worker, /pathname === "\/buscar"[\s\S]*?pathname === "\/ofertas"[\s\S]*?pathname === "\/api\/categories"[\s\S]*?pathname === "\/api\/promotions"[\s\S]*?pathname === "\/api\/search"[\s\S]*?pathname\.startsWith\("\/api\/products"\)[\s\S]*?handler:\s*new NetworkOnly\(\)/);
  assert.match(layout, /swUrl="\/sw\.js"/);
  assert.match(layout, /process\.env\.NODE_ENV !== "production" \|\| process\.env\.DISABLE_PWA === "true"/);
  assert.match(layout, /cacheOnNavigation=\{false\}/);
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
