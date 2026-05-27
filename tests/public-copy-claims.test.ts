import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const PUBLIC_COPY_FILES = [
	"src/app/page.tsx",
	"src/app/ofertas/page.tsx",
	"src/lib/home-ui-data.ts",
] as const;

const UNBACKED_LIVE_PRICE_PATTERN =
	/\b(Mercado vivo|precio actual|precio real|en vivo|Actualizado hoy|Datos actualizados hoy|última semana|ultima semana)\b/i;

describe("public price copy claims", () => {
	it("keeps public surfaces away from unbacked live/current price language", () => {
		for (const filePath of PUBLIC_COPY_FILES) {
			const source = readFileSync(filePath, "utf8");

			assert.doesNotMatch(
				source,
				UNBACKED_LIVE_PRICE_PATTERN,
				`${filePath} has unbacked live/current price copy`,
			);
		}
	});
});
