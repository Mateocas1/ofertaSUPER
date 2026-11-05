"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useState } from "react";

// Product photos come from the supermarkets' CDNs. A missing or broken image
// degrades to a calm placeholder instead of a broken-image icon.
export function DropThumb({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-3/60 sm:size-20">
      {src && !failed ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="80px"
          className="object-contain p-1"
          loading="lazy"
          onError={() => setFailed(true)}
          unoptimized
        />
      ) : (
        <div className="flex h-full items-center justify-center text-muted-foreground" role="img" aria-label="Sin foto">
          <ImageOff className="size-5" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
