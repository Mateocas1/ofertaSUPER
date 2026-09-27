// Gate 4c: strict recognition of simple Carrefour promotions from the
// PromotionTeasers[].Name values. The rule only accepts two shapes:
//   - "Ndo al X%" (optionally "Max N unidades") -> nth-unit
//   - "X% Off"    (optionally "Max N unidades") -> percent-off
// Card, bank and fidelity names, campaign headlines and anything else are
// rejected; no label is ever invented from an unrecognized name.

export type SimplePromotion = {
	type: "nth-unit" | "percent-off";
	percent: number;
	nth?: number;
	maxUnits: number | null;
	label: string;
};

const EXCLUDED_NAME_PATTERN = /tarjeta|banco|\bmi\s+crf\b|cuotas|fidelidad|exclusivo|puntos|\bhasta\b/i;
const NTH_UNIT_PATTERN = /\b(\d+)do\s+al\s*(\d{1,2})\s*%/i;
const PERCENT_OFF_PATTERN = /\b(\d{1,2})\s*%\s*off\b/i;
const MAX_UNITS_PATTERN = /\bmax\s*(\d{1,3})\s*unidades?\b/i;

function percentOf(value: string) {
	const percent = Number(value);
	return percent > 0 && percent <= 99 ? percent : null;
}

export function parseSimplePromotion(name: string): SimplePromotion | null {
	const normalized = name.trim();
	if (normalized.length === 0 || EXCLUDED_NAME_PATTERN.test(normalized)) {
		return null;
	}

	const maxUnits = MAX_UNITS_PATTERN.exec(normalized)?.[1];
	const maxUnitsValue = maxUnits !== undefined ? Number(maxUnits) : null;

	const nthUnit = NTH_UNIT_PATTERN.exec(normalized);
	if (nthUnit) {
		const percent = percentOf(nthUnit[2]);
		if (percent !== null) {
			const nth = Number(nthUnit[1]);
			return { type: "nth-unit", nth, percent, maxUnits: maxUnitsValue, label: `${nth}do al ${percent}%` };
		}
	}

	const percentOff = PERCENT_OFF_PATTERN.exec(normalized);
	if (percentOff) {
		const percent = percentOf(percentOff[1]);
		if (percent !== null) {
			return { type: "percent-off", percent, maxUnits: maxUnitsValue, label: `${percent}% OFF` };
		}
	}

	return null;
}
