import {
	DIRECT_REFRESH_HEALTH_SOURCES,
	directRefreshSupportForSource,
	type DirectRefreshHealthSourceSlug,
	type DirectRefreshSupport,
} from "./direct-refresh-source-health";

export type DirectRefreshKillSwitchStatus = "PASS" | "FAIL";
export type DirectRefreshKillSwitchScope = "global" | "source";

export type DirectRefreshKillSwitchControl = {
	schemaVersion: 1;
	control: "direct-refresh-kill-switch";
	global?: DirectRefreshKillSwitchControlEntry | null;
	sources?: Partial<Record<DirectRefreshHealthSourceSlug, DirectRefreshKillSwitchControlEntry>>;
};

export type DirectRefreshKillSwitchControlEntry = {
	stop: boolean;
	reason?: string | null;
	owner?: string | null;
	createdAt?: string | null;
	expiresAt?: string | null;
};

export type DirectRefreshKillSwitchReport = {
	schemaVersion: 1;
	audit: "direct-refresh-kill-switch";
	status: DirectRefreshKillSwitchStatus;
	generatedAt: string;
	basis: "supplied-control";
	dryRun: true;
	writeBoundary: typeof WRITE_BOUNDARY;
	filters: {
		source: DirectRefreshHealthSourceSlug | null;
		controlPath: string | null;
	};
	summary: {
		evaluatedSources: DirectRefreshHealthSourceSlug[];
		activeStopCount: number;
		expiredStopCount: number;
		invalidControlCount: number;
		schedulerGate: "blocked";
	};
	activeControls: DirectRefreshKillSwitchActiveControl[];
	inactiveControls: DirectRefreshKillSwitchInactiveControl[];
	invalidControls: Array<{ path: string | null; message: string }>;
	recommendation: string;
};

export type DirectRefreshKillSwitchActiveControl = {
	scope: DirectRefreshKillSwitchScope;
	source: DirectRefreshHealthSourceSlug | null;
	directRefreshSupport: DirectRefreshSupport | null;
	reason: string;
	owner: string;
	createdAt: string | null;
	expiresAt: string | null;
	expired: false;
};

export type DirectRefreshKillSwitchInactiveControl = {
	scope: DirectRefreshKillSwitchScope;
	source: DirectRefreshHealthSourceSlug | null;
	reason: string | null;
	owner: string | null;
	createdAt: string | null;
	expiresAt: string | null;
	expired: boolean;
};

const WRITE_BOUNDARY =
	"read-only direct-refresh kill switch evaluation; no production writes, no scheduler/cron/workflow/all-source/retry side effects, no notification delivery" as const;

function evaluatedSourcesFor(source: DirectRefreshHealthSourceSlug | null) {
	return source ? [source] : [...DIRECT_REFRESH_HEALTH_SOURCES];
}

function killSwitchStatus(
	activeControlCount: number,
	invalidControlCount: number,
): DirectRefreshKillSwitchStatus {
	return activeControlCount > 0 || invalidControlCount > 0 ? "FAIL" : "PASS";
}

function killSwitchRecommendation(status: DirectRefreshKillSwitchStatus) {
	return status === "PASS"
		? "No active kill switch stop applies; continue only through approved controlled manual gates."
		: "Stop direct-refresh operation until active or invalid kill switch controls are resolved.";
}

function expiredStopCount(
	inactiveControls: DirectRefreshKillSwitchInactiveControl[],
) {
	return inactiveControls.filter((control) => control.expired).length;
}

export function evaluateDirectRefreshKillSwitch({
	control,
	source = null,
	controlPath = null,
	now = new Date(),
}: {
	control: unknown;
	source?: DirectRefreshHealthSourceSlug | null;
	controlPath?: string | null;
	now?: Date;
}): DirectRefreshKillSwitchReport {
	const evaluatedSources = evaluatedSourcesFor(source);
	const invalidControls: Array<{ path: string | null; message: string }> = [];
	const activeControls: DirectRefreshKillSwitchActiveControl[] = [];
	const inactiveControls: DirectRefreshKillSwitchInactiveControl[] = [];
	const parsed = parseControl(control, controlPath, invalidControls);

	if (parsed) {
		collectGlobalControl({
			entry: parsed.global ?? null,
			now,
			controlPath,
			activeControls,
			inactiveControls,
			invalidControls,
		});
		collectSourceControls({
			sources: parsed.sources ?? {},
			evaluatedSources,
			now,
			controlPath,
			activeControls,
			inactiveControls,
			invalidControls,
		});
	}

	const status = killSwitchStatus(
		activeControls.length,
		invalidControls.length,
	);
	return {
		schemaVersion: 1,
		audit: "direct-refresh-kill-switch",
		status,
		generatedAt: now.toISOString(),
		basis: "supplied-control",
		dryRun: true,
		writeBoundary: WRITE_BOUNDARY,
		filters: { source, controlPath },
		summary: {
			evaluatedSources,
			activeStopCount: activeControls.length,
			expiredStopCount: expiredStopCount(inactiveControls),
			invalidControlCount: invalidControls.length,
			schedulerGate: "blocked",
		},
		activeControls,
		inactiveControls,
		invalidControls,
		recommendation: killSwitchRecommendation(status),
	};
}

export function assertDirectRefreshKillSwitchAllowsSource({
	control,
	source,
	controlPath = null,
	now = new Date(),
}: {
	control: unknown;
	source: DirectRefreshHealthSourceSlug;
	controlPath?: string | null;
	now?: Date;
}) {
	const report = evaluateDirectRefreshKillSwitch({ control, source, controlPath, now });
	if (report.status === "PASS") return report;
	const active = report.activeControls
		.map((control) => `${control.scope}${control.source ? `:${control.source}` : ""} ${control.reason}`)
		.join("; ");
	const invalid = report.invalidControls.map((control) => control.message).join("; ");
	throw new Error(
		`direct-refresh kill switch blocks source ${source}${active ? `: ${active}` : ""}${invalid ? `: ${invalid}` : ""}`,
	);
}

function pushInvalidControl(
	invalidControls: Array<{ path: string | null; message: string }>,
	controlPath: string | null,
	message: string,
) {
	invalidControls.push({ path: controlPath, message });
}

function isOptionalRecord(value: unknown) {
	return value === undefined || value === null || asRecord(value) !== null;
}

function parseControl(
	control: unknown,
	controlPath: string | null,
	invalidControls: Array<{ path: string | null; message: string }>,
) {
	const object = asRecord(control);
	if (!object) {
		pushInvalidControl(
			invalidControls,
			controlPath,
			"kill switch control must be an object",
		);
		return null;
	}
	if (object.schemaVersion !== 1 || object.control !== "direct-refresh-kill-switch") {
		pushInvalidControl(
			invalidControls,
			controlPath,
			"invalid direct-refresh kill switch schema",
		);
		return null;
	}
	if (!isOptionalRecord(object.global)) {
		pushInvalidControl(
			invalidControls,
			controlPath,
			"global kill switch control must be an object",
		);
	}
	if (!isOptionalRecord(object.sources)) {
		pushInvalidControl(
			invalidControls,
			controlPath,
			"sources kill switch controls must be an object",
		);
	}
	return {
		global: asRecord(object.global) as DirectRefreshKillSwitchControlEntry | null,
		sources: (asRecord(object.sources) ?? {}) as Record<string, DirectRefreshKillSwitchControlEntry>,
	};
}

function collectGlobalControl({
	entry,
	now,
	controlPath,
	activeControls,
	inactiveControls,
	invalidControls,
}: {
	entry: DirectRefreshKillSwitchControlEntry | null;
	now: Date;
	controlPath: string | null;
	activeControls: DirectRefreshKillSwitchActiveControl[];
	inactiveControls: DirectRefreshKillSwitchInactiveControl[];
	invalidControls: Array<{ path: string | null; message: string }>;
}) {
	collectControl({
		entry,
		scope: "global",
		source: null,
		applies: true,
		now,
		controlPath,
		activeControls,
		inactiveControls,
		invalidControls,
	});
}

function collectSourceControls({
	sources,
	evaluatedSources,
	now,
	controlPath,
	activeControls,
	inactiveControls,
	invalidControls,
}: {
	sources: Record<string, DirectRefreshKillSwitchControlEntry>;
	evaluatedSources: DirectRefreshHealthSourceSlug[];
	now: Date;
	controlPath: string | null;
	activeControls: DirectRefreshKillSwitchActiveControl[];
	inactiveControls: DirectRefreshKillSwitchInactiveControl[];
	invalidControls: Array<{ path: string | null; message: string }>;
}) {
	for (const key of Object.keys(sources)) {
		if (!isDirectRefreshSource(key)) {
			invalidControls.push({
				path: controlPath,
				message: `unknown direct-refresh kill switch source ${key}`,
			});
			continue;
		}
		collectControl({
			entry: sources[key] ?? null,
			scope: "source",
			source: key,
			applies: evaluatedSources.includes(key),
			now,
			controlPath,
			activeControls,
			inactiveControls,
			invalidControls,
		});
	}
}

function collectControl({
	entry,
	scope,
	source,
	applies,
	now,
	controlPath,
	activeControls,
	inactiveControls,
	invalidControls,
}: {
	entry: DirectRefreshKillSwitchControlEntry | null;
	scope: DirectRefreshKillSwitchScope;
	source: DirectRefreshHealthSourceSlug | null;
	applies: boolean;
	now: Date;
	controlPath: string | null;
	activeControls: DirectRefreshKillSwitchActiveControl[];
	inactiveControls: DirectRefreshKillSwitchInactiveControl[];
	invalidControls: Array<{ path: string | null; message: string }>;
}) {
	if (!entry) return;
	if (typeof entry.stop !== "boolean") {
		invalidControls.push({ path: controlPath, message: `${controlLabel(scope, source)} stop must be boolean` });
		return;
	}
	const createdAt = normalizeOptionalIso(entry.createdAt, `${controlLabel(scope, source)} createdAt`, controlPath, invalidControls);
	const expiresAt = normalizeOptionalIso(entry.expiresAt, `${controlLabel(scope, source)} expiresAt`, controlPath, invalidControls);
	const expired = expiresAt ? new Date(expiresAt).getTime() <= now.getTime() : false;
	if (!entry.stop || !applies || expired) {
		pushInactiveControl({ scope, source, entry, createdAt, expiresAt, expired, inactiveControls });
		return;
	}
	pushActiveControl({
		scope,
		source,
		entry,
		createdAt,
		expiresAt,
		controlPath,
		activeControls,
		invalidControls,
	});
}

function pushInactiveControl({
	scope,
	source,
	entry,
	createdAt,
	expiresAt,
	expired,
	inactiveControls,
}: {
	scope: DirectRefreshKillSwitchScope;
	source: DirectRefreshHealthSourceSlug | null;
	entry: DirectRefreshKillSwitchControlEntry;
	createdAt: string | null;
	expiresAt: string | null;
	expired: boolean;
	inactiveControls: DirectRefreshKillSwitchInactiveControl[];
}) {
	inactiveControls.push({
		scope,
		source,
		reason: stringOrNull(entry.reason),
		owner: stringOrNull(entry.owner),
		createdAt,
		expiresAt,
		expired,
	});
}

function pushActiveControl({
	scope,
	source,
	entry,
	createdAt,
	expiresAt,
	controlPath,
	activeControls,
	invalidControls,
}: {
	scope: DirectRefreshKillSwitchScope;
	source: DirectRefreshHealthSourceSlug | null;
	entry: DirectRefreshKillSwitchControlEntry;
	createdAt: string | null;
	expiresAt: string | null;
	controlPath: string | null;
	activeControls: DirectRefreshKillSwitchActiveControl[];
	invalidControls: Array<{ path: string | null; message: string }>;
}) {
	const reason = stringOrNull(entry.reason);
	const owner = stringOrNull(entry.owner);
	if (!reason) invalidControls.push({ path: controlPath, message: `${controlLabel(scope, source)} active stop requires reason` });
	if (!owner) invalidControls.push({ path: controlPath, message: `${controlLabel(scope, source)} active stop requires owner` });
	activeControls.push({
		scope,
		source,
		directRefreshSupport: source ? directRefreshSupportForSource(source) : null,
		reason: reason ?? "missing reason",
		owner: owner ?? "missing owner",
		createdAt,
		expiresAt,
		expired: false,
	});
}

function normalizeOptionalIso(
	value: unknown,
	label: string,
	controlPath: string | null,
	invalidControls: Array<{ path: string | null; message: string }>,
) {
	if (value === undefined || value === null || value === "") return null;
	if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
		invalidControls.push({ path: controlPath, message: `${label} must be a valid ISO timestamp` });
		return null;
	}
	return new Date(value).toISOString();
}

function isDirectRefreshSource(value: string): value is DirectRefreshHealthSourceSlug {
	return DIRECT_REFRESH_HEALTH_SOURCES.includes(value as DirectRefreshHealthSourceSlug);
}

function controlLabel(scope: DirectRefreshKillSwitchScope, source: DirectRefreshHealthSourceSlug | null) {
	return source ? `${scope} ${source}` : scope;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function stringOrNull(value: unknown) {
	return typeof value === "string" && value.trim() ? value : null;
}
