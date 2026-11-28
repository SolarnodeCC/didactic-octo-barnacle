import { defineConfig } from "vitest/config";

// Unit tests only: the search tool is tested on a stubbed fetch. The network guard makes a
// forgotten stub fail instead of reaching Tavily (REQ-TEST-003, REQ-AGENT-013 AC5).
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
