import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Replays and candidate generation are heavy, and CI runs them with coverage on a slow runner
    // (one test took 5.4 s there and under 1 s locally), so the 5 s default fails them at random.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/generated/**", "src/**/index.ts"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
