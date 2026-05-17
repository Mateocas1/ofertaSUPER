import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import { SiteHeader } from "@/components/site-header";
import "./globals.css";

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
  themeColor: "#1f6f3f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" className="h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <ClerkProvider>
          <div className="relative flex min-h-full flex-col">
            <a href="#main-content" className="skip-link">
              Saltar al contenido
            </a>
            <SiteHeader />
            <main id="main-content" className="relative flex-1">
              {children}
            </main>
            <footer className="relative border-t border-border bg-card/85 px-6 py-8">
              <div className="mx-auto flex w-full max-w-[1512px] flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
                <p>ofertasSUPER compara productos, precios y canastas de supermercados argentinos.</p>
                <p>Datos agregados por producto, supermercado y cobertura.</p>
              </div>
            </footer>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
