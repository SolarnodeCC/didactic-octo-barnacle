import { defineConfig } from "vitest/config";

// Unit tests only: the eval runner reads the golden sets from disk and calls no model.
// The network guard makes a forgotten stub fail instead of reaching a provider (ADR 0043).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["../../test-support/no-network.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
