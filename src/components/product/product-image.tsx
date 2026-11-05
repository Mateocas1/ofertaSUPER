"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";

import { cn } from "@/lib/utils";

type ProductImageProps = {
  src: string | null;
  alt: string;
  className?: string;
};

// Square product photo. Images come from the supermarkets' CDNs and may be
// missing or fail to load; both cases degrade to a calm placeholder instead
// of a broken-image icon. The optimizer is off (`images.unoptimized`).
export function ProductImage({ src, alt, className }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== null && !failed;

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden rounded-xl border border-border", showImage ? "bg-white" : "bg-surface-1", className)}>
      {showImage ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(min-width: 768px) 320px, 100vw"
          className="object-contain p-4"
          unoptimized
          loading="eager"
          fetchPriority="high"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
          <ImageOff className="size-8" aria-hidden="true" />
          <span className="text-xs">Sin imagen</span>
        </div>
      )}
    </div>
  );
}
