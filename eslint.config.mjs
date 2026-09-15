/**
 * eslint-config-next 16 ships native flat configs, so they are spread in
 * directly — no FlatCompat shim, and no @eslint/eslintrc dependency.
 */
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "data/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Allow deliberately unused args, written with a leading underscore.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default config;
