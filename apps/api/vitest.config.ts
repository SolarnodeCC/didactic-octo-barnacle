import { defineConfig } from "vitest/config";

// Unit tests are `*.test.ts`; integration tests (`*.int.test.ts`) run the real migrations on
// in-memory SQLite. Both run without network access (test-support/no-network.ts).
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["../../test-support/no-network.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**"],
      reporter: ["text", "json-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
        },
      },
    ],
  },
});
