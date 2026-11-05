import type { SVGProps } from "react";

// The one brand mark: a shopping list whose price goes down. The same drawing
// ships as favicon / PWA icons (public/*.svg); here it follows the theme tokens.
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <rect width="64" height="64" rx="16" fill="var(--primary)" />
      <rect x="15" y="18" width="28" height="6" rx="3" fill="var(--primary-foreground)" />
      <rect x="15" y="29" width="18" height="6" rx="3" fill="var(--primary-foreground)" />
      <rect x="15" y="40" width="28" height="6" rx="3" fill="var(--primary-foreground)" />
      <circle cx="44" cy="32" r="10" fill="var(--deal)" />
      <path d="M39.5 32H48.5" stroke="var(--primary-foreground)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
