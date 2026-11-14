import { defineConfig } from "vitest/config";

// Unit tests of pure app logic (no DOM, no router). The app's own build config is vite.config.ts.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
