import { defineConfig } from "vitest/config";

// Performance budgets run without coverage: instrumentation distorts timings.
export default defineConfig({
  test: {
    include: ["bench/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
