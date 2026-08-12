import "./load-env";

import {
	formatRuntimeContractErrors,
	RUNTIME_ROLES,
	type RuntimeRole,
	validateRuntimeContract,
} from "./runtime-contract";

const role = process.argv[2] as RuntimeRole | undefined;

if (!role || !RUNTIME_ROLES.includes(role)) {
	console.error(`Usage: npm run runtime:check -- <${RUNTIME_ROLES.join("|")}>`);
	process.exitCode = 2;
} else {
	const result = validateRuntimeContract(role, process.env);

	if (result.missing.length || result.invalid.length) {
		console.error(formatRuntimeContractErrors(result));
		process.exitCode = 1;
	} else {
		console.log(`Runtime contract satisfied for role ${role}.`);
	}
}
