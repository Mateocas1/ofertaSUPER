import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, siteUrl } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/"],
      },
      {
        userAgent: "Googlebot",
        allow: ["/", "/ofertas", "/buscar", "/categoria/", "/producto/", "/canasta"],
        disallow: ["/admin/", "/api/"],
      },
    ],
    sitemap: buildAbsoluteUrl("/sitemap.xml"),
    host: siteUrl.origin,
  };
}