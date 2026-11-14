import { defineConfig } from "vitest/config";

// Unit tests of pure app logic (no DOM, no router). The app's own build config is vite.config.ts.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Unit tests use fixture responses, without local service configuration.
    env: {
      VITE_SCIENCE_API_URL: "https://api.example.invalid",
      VITE_SI_GATEWAY_URL: "https://si.example.invalid",
    },
  },
});
