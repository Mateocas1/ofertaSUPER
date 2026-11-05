"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Wraps a product image so a remote image that fails to load (product images
// come from the supermarkets' CDNs) leaves the calm placeholder visible
// instead of the browser's broken-image icon. The image element stays a child
// rendered on the server; this only listens for its error.
export function ThumbFrame({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const image = frame.querySelector("img");
    // The error may have fired before hydration.
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
    const onError = () => setFailed(true);
    frame.addEventListener("error", onError, true);
    return () => frame.removeEventListener("error", onError, true);
  }, []);

  return (
    <div ref={ref} className={cn(className, failed && "[&_img]:hidden")}>
      {children}
    </div>
  );
}
