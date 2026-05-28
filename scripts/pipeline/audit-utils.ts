export function decimalToNumber(value: { toString(): string } | number | null) {
	if (value === null) {
		return null;
	}

	const numeric = Number(value.toString());
	return Number.isFinite(numeric) ? numeric : null;
}

export function dateToIso(value: Date | string | null) {
	if (!value) {
		return null;
	}

	return value instanceof Date
		? value.toISOString()
		: new Date(value).toISOString();
}

export function uniqueSorted(values: string[]) {
	return Array.from(new Set(values)).sort();
}

export function findDuplicates(values: string[]) {
	const seen = new Set<string>();
	const duplicates = new Set<string>();

	for (const value of values) {
		if (seen.has(value)) {
			duplicates.add(value);
		} else {
			seen.add(value);
		}
	}

	return Array.from(duplicates).sort();
}

function getFlagValues(argv: string[], flagName: string) {
	const prefix = `${flagName}=`;
	return argv
		.filter((value) => value.startsWith(prefix))
		.map((value) => value.slice(prefix.length));
}

export function getOptionalSingleFlag(argv: string[], flagName: string) {
	const values = getFlagValues(argv, flagName);

	if (values.length > 1) {
		throw new Error(`accepts at most one ${flagName}=... flag`);
	}

	return values[0] ?? null;
}

export function getRequiredSingleFlag(argv: string[], flagName: string) {
	const value = getOptionalSingleFlag(argv, flagName);

	if (!value?.trim()) {
		throw new Error(`requires ${flagName}=...`);
	}

	return value.trim();
}

export function parseListFlagValue(value: string | null) {
	return (value ?? "")
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean);
}

export function parseOptionalListFlag(argv: string[], flagName: string) {
	return parseListFlagValue(getOptionalSingleFlag(argv, flagName));
}

export function parsePositiveIntegerFlag(
	argv: string[],
	flagName: string,
	fallback: number,
) {
	const raw = getOptionalSingleFlag(argv, flagName);

	if (raw === null) {
		return fallback;
	}

	const parsed = Number(raw);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`requires ${flagName}=... to be a positive integer`);
	}

	return parsed;
}

export function parseNumberFlag(
	argv: string[],
	flagName: string,
	fallback: number,
) {
	const raw = getOptionalSingleFlag(argv, flagName);

	if (raw === null) {
		return fallback;
	}

	const parsed = Number(raw);

	if (!Number.isFinite(parsed)) {
		throw new Error(`requires ${flagName}=... to be numeric`);
	}

	return parsed;
}
