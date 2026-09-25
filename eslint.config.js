import js from "@eslint/js";
import tsPlugin from "typescript-eslint";

export default tsPlugin.config(
  js.configs.recommended,
  ...tsPlugin.configs.recommended,
  {
    files: ["extensions/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "error",
    },
  },
  {
    ignores: ["node_modules/**", "dist/**", "*.config.js", "*.config.mjs", ".husky/**"],
  },
);
