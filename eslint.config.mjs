import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
