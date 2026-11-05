import { SerwistProvider } from "@serwist/next/react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { FOOTER_LINKS } from "@/lib/site-nav";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
// Bricolage is the display face for the wordmark and the home H1 only.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: ["800"], variable: "--font-bricolage", display: "swap" });

const APP_NAME = "ofertasSUPER";
const APP_DESCRIPTION = "Comparador de precios y canastas de supermercados argentinos.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.svg", type: "image/svg+xml", sizes: "192x192" },
      { url: "/icon-512.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: {
      default: APP_NAME,
      template: `%s | ${APP_NAME}`,
    },
    description: APP_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: APP_NAME,
      template: `%s | ${APP_NAME}`,
    },
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1f6f3f" },
    { media: "(prefers-color-scheme: dark)", color: "#171d1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className={`${geist.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV !== "production" || process.env.DISABLE_PWA === "true"}
          cacheOnNavigation={false}
          reloadOnOnline
        />
        <div className="flex min-h-full flex-col">
          <a href="#main-content" className="skip-link">
            Saltar al contenido
          </a>
          <SiteHeader />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <footer className="border-t border-border bg-surface-1">
            <div className="container-page flex flex-col gap-6 py-8 text-sm text-muted-foreground md:flex-row md:items-start md:justify-between">
              <div className="max-w-md space-y-2">
                <p className="font-medium text-foreground">ofertasSUPER</p>
                <p>
                  Precios registrados de supermercados argentinos, comparados por código de barras. Cada precio
                  muestra la fecha en que se relevó: verificalo en la web del supermercado antes de comprar.
                </p>
              </div>
              <nav aria-label="Pie de página">
                <ul className="grid grid-cols-2 gap-x-8 gap-y-1 sm:flex sm:gap-6">
                  {FOOTER_LINKS.map((link) => (
                    <li key={link.href}>
                      {link.href.endsWith(".xml") ? (
                        <a href={link.href} type="application/atom+xml" className="inline-flex min-h-11 items-center hover:text-foreground">
                          {link.label}
                        </a>
                      ) : (
                        <Link href={link.href} className="inline-flex min-h-11 items-center hover:text-foreground">
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
