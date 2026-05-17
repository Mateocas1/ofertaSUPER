import type { Metadata } from "next";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ofertas-super.vercel.app");

type MetadataInput = {
  title: string;
  description: string;
  path?: string;
};

export function buildAbsoluteUrl(path = "/") {
  return new URL(path, siteUrl).toString();
}

export function createMetadata({ title, description, path = "/" }: MetadataInput): Metadata {
  const url = buildAbsoluteUrl(path);

  return {
    metadataBase: siteUrl,
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: "ofertasSUPER",
      locale: "es_AR",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
