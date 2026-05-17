import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const DEFAULT_CONNECTION_LIMIT = "3";
const DEFAULT_POOL_TIMEOUT = "10";

function normalizeDatabaseUrlForPooling(rawUrl: string) {
	try {
		const parsed = new URL(rawUrl);

		if (!parsed.searchParams.has("connection_limit")) {
			parsed.searchParams.set(
				"connection_limit",
				process.env.DB_CONNECTION_LIMIT ?? DEFAULT_CONNECTION_LIMIT,
			);
		}

		if (!parsed.searchParams.has("pool_timeout")) {
			parsed.searchParams.set("pool_timeout", process.env.DB_POOL_TIMEOUT ?? DEFAULT_POOL_TIMEOUT);
		}

		return parsed.toString();
	} catch {
		return rawUrl;
	}
}

if (process.env.DATABASE_URL) {
	process.env.DATABASE_URL = normalizeDatabaseUrlForPooling(process.env.DATABASE_URL);
}