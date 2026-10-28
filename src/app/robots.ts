import type { MetadataRoute } from "next";

import { buildAbsoluteUrl, siteUrl } from "@/lib/seo/metadata";

// Bulk AI training and answer-engine crawlers. They bring no search traffic
// and each crawl of the catalog costs function CPU. Google-Extended and
// Applebot-Extended are opt-out tokens only: Googlebot and Applebot keep
// indexing the site for search. Fetchers a person triggers from a chat
// (ChatGPT-User, Perplexity-User) stay allowed.
const AI_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "Google-Extended",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Timpibot",
  "YouBot",
];

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
      {
        userAgent: AI_CRAWLERS,
        disallow: "/",
      },
    ],
    sitemap: buildAbsoluteUrl("/sitemap.xml"),
    host: siteUrl.origin,
  };
}