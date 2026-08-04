import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      ".wrangler/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // Phase 7 client enhancement layer + service worker (plain JS, browser).
    files: ["public/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
);
