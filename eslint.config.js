import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "**/node_modules/", "cdk.out/", "data/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Every LLM call goes through the Vercel AI SDK (kit rule stack-ai-sdk-for-llm).
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "@anthropic-ai/sdk", message: "Use the Vercel AI SDK (ai + @ai-sdk/anthropic)." }],
        },
      ],
    },
  },
);
