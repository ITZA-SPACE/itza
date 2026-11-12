import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { writeCopyKeys } from "./scripts/copyKeys.mjs";

/** Regenerates the typed copy keys when a copy file is added, changed or removed. */
function copyKeys(): Plugin {
  return {
    name: "itza:copy-keys",
    buildStart: () => writeCopyKeys(),
    configureServer(server) {
      writeCopyKeys();
      server.watcher.on("all", (_event, file) => {
        if (/\/src\/copy\/en\/[^/]+\.json$/.test(file)) writeCopyKeys();
      });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    copyKeys(),
    react(),
    tailwindcss(),
  ],
  build: {
    target: "es2023",
    sourcemap: true,
  },
});
