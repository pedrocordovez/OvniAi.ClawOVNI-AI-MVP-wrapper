import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run each test file in isolation to avoid import side-effects
    isolate: true,
    // ESM-compatible
    globals: false,
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/services/**", "src/routes/**"],
      exclude: ["src/db/**", "src/tests/**"],
    },
  },
});
