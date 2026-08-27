import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "complexity/governance-metrics",
    plugins: { sonarjs },
    rules: {
      complexity: ["warn", 10],
      "sonarjs/cognitive-complexity": ["warn", 15],
    },
  },
  {
    name: "legacy/set-state-in-effect",
    files: ["src/components/canasta-page.tsx", "src/components/search-bar.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "public/*.js",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
