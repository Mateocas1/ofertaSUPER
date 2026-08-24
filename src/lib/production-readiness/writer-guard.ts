import { evaluateProductionGate, type GateInput } from "./policy";

/** This guard supplements, never replaces, direct-refresh prewrite, lock, and rollback checks. */
export function canWriteProductionCatalog(input: { authority?: GateInput; stage: unknown; dryRun: unknown; source: unknown }) {
	const authority = input.authority ? evaluateProductionGate(input.authority) : undefined;
	return authority?.allowed === true
		&& authority.stage === "limited-writes"
		&& authority.authority?.role === "operator-alert-go-no-go"
		&& input.stage === "limited-writes"
		&& input.dryRun === false
		&& input.source === "disco";
}
