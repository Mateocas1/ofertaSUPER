// Primary navigation for the site header. The wordmark links home, so there is
// no "Inicio" entry; the basket lives in its own button with the item count.
export const SITE_NAV = [
  { href: "/buscar", label: "Buscar" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/bajas", label: "Bajas" },
  { href: "/inflacion", label: "Inflación" },
] as const;

export const FOOTER_LINKS = [
  { href: "/metodologia", label: "Metodología" },
  { href: "/inflacion", label: "Inflación por producto" },
  { href: "/bajas", label: "Bajas de precio" },
  { href: "/bajas/feed.xml", label: "Feed Atom de bajas" },
] as const;
