"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

// The one product photo of the site. Photos come from the supermarkets' CDNs
// and can be missing or fail to load, so a calm placeholder always sits under
// the photo: a broken image degrades to the placeholder, never to the
// browser's broken-image icon. The image optimizer is off (`images.unoptimized`).

const SIZES = {
  /** 56px rows: home drops. */
  sm: { box: "size-14", sizes: "56px", icon: "size-5", padding: "p-1" },
  /** 64px cards and rows: search cards, /bajas, the basket. */
  md: { box: "size-16", sizes: "64px", icon: "size-5", padding: "p-1" },
  /** The product page photo. */
  hero: { box: "aspect-square w-full", sizes: "(min-width: 768px) 320px, 100vw", icon: "size-8", padding: "p-4" },
} as const;

type ProductThumbProps = {
  src: string | null;
  /** Empty when the photo is decorative (the product name is next to it). */
  alt?: string;
  size?: keyof typeof SIZES;
  /** Eager, high-priority load: only for the product page photo. */
  priority?: boolean;
  className?: string;
};

export function ProductThumb({ src, alt = "", size = "md", priority = false, className }: ProductThumbProps) {
  const [failed, setFailed] = useState(false);
  const style = SIZES[size];
  const showImage = src !== null && !failed;

  return (
    <div className={cn("relative shrink-0 overflow-hidden rounded-lg border border-border bg-surface-1", style.box, className)}>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground/70" aria-hidden="true">
        <ImageOff className={style.icon} />
        {size === "hero" ? <span className="text-xs">Sin imagen</span> : null}
      </div>
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={style.sizes}
          className={cn("bg-white object-contain", style.padding)}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onError={() => setFailed(true)}
          ref={(image) => {
            // An error that fires before hydration never reaches onError.
            if (image?.complete && image.naturalWidth === 0) setFailed(true);
          }}
          unoptimized
        />
      ) : null}
    </div>
  );
}
