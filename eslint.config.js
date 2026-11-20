import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "data/**",
      ".worktrees/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain Node ES modules (test fixtures run directly by Playwright/tsx).
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      // The repository already contains explicit `any`s, mostly at provider and
      // JSON payload boundaries. Keep them visible as warnings so this gate can
      // be switched on without a type refactor in the same change, and so the
      // remaining debt is counted in every run.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": "allow-with-description",
        "ts-nocheck": true,
        "ts-check": false,
        "ts-expect-error": "allow-with-description",
        "minimumDescriptionLength": 10
      }]
    }
  }
);
