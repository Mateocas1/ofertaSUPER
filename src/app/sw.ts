/// <reference lib="webworker" />

import { defaultCache } from "@serwist/next/worker";
import { NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, RuntimeCaching } from "serwist";

declare global {
  interface WorkerGlobalScope {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: ServiceWorkerGlobalScope;

const catalogNetworkOnly: RuntimeCaching = {
  matcher: ({ sameOrigin, url: { pathname } }) =>
    sameOrigin && (
      pathname === "/buscar" ||
      pathname === "/ofertas" ||
      pathname === "/api/categories" ||
      pathname === "/api/promotions" ||
      pathname === "/api/search" ||
      pathname.startsWith("/api/products")
    ),
  method: "GET",
  handler: new NetworkOnly(),
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [catalogNetworkOnly, ...defaultCache],
  fallbacks: {
    entries: [{ matcher: ({ request }) => request.destination === "document", url: "/~offline" }],
  },
});

serwist.addEventListeners();
