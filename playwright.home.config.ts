import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./tests",
	testMatch: "home-cta.browser.ts",
	fullyParallel: false,
	timeout: 30_000,
	use: {
		baseURL: "http://127.0.0.1:3100",
		browserName: "chromium",
		serviceWorkers: "block",
	},
	webServer: {
		command: "npm run start -- --hostname 127.0.0.1 --port 3100",
		url: "http://127.0.0.1:3100",
		reuseExistingServer: false,
		timeout: 30_000,
		env: { CATALOG_OFFLINE_MODE: "true" },
	},
});
