import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      // Generated verification bundles, tool artifacts and scratch files are not source.
      "build-verification*/**",
      ".gitnexus/**",
      ".superpowers/**",
      ".swarm/**",
      "tmp-*.cjs",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "data/**",
      ".worktrees/**",
      ".venv-qag/**",
      "worktree-retirement-backup-*/**",
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
        Buffer: "readonly",
      },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Browser-side probe is plain JS evaluated in Chromium, not Node.
    files: ["tests/voice-benchmark/browser-probe.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        performance: "readonly",
        SpeechSynthesisUtterance: "readonly",
      },
    },
  },
  {
    // Visual capture script runs in a browser page via Playwright evaluation.
    files: ["docs/design-directions/capture.mjs"],
    languageOptions: { globals: { document: "readonly" } },
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
