"use client";

import Image from "next/image";
import { useState } from "react";
import { Package } from "lucide-react";

// Product photos come from the supermarkets' CDNs and can fail to load. The
// placeholder sits under the photo, so a missing or broken image degrades to a
// calm tile instead of a broken-image icon. The photo is decorative: the
// product name is the link text next to it.
export function DropThumb({ src }: { src: string | null }) {
	const [failed, setFailed] = useState(false);
	const showImage = src !== null && !failed;

	return (
		<div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-surface-1">
			<div className="absolute inset-0 flex items-center justify-center text-muted-foreground/60" aria-hidden="true">
				<Package className="size-5" />
			</div>
			{showImage ? (
				<Image
					src={src}
					alt=""
					fill
					sizes="56px"
					className="img-outline bg-white object-contain"
					onError={() => setFailed(true)}
					ref={(image) => {
						// An error before hydration never reaches onError.
						if (image?.complete && image.naturalWidth === 0) setFailed(true);
					}}
					unoptimized
				/>
			) : null}
		</div>
	);
}
