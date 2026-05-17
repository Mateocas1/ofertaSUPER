import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, siteUrl } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/", "/canasta"],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/ofertas", "/buscar", "/categoria/", "/producto/"],
        disallow: ["/admin/", "/api/", "/canasta"],
      },
    ],
    sitemap: buildAbsoluteUrl("/sitemap.xml"),
    host: siteUrl.origin,
  };
}