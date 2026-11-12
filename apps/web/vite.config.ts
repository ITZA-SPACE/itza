import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
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
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "ITZA",
        short_name: "ITZA",
        description: "See Earth Through Time.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: "#1f5f3f",
        background_color: "#ffffff",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The app shell, engine worker, styles and the hero bundles (public/bundles/*/bundle.json).
        globPatterns: ["**/*.{js,css,html,svg,png,json,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // The style and the TileJSON (it names the dated tile set) must follow upstream updates.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(styles\/|planet$)/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "basemap-styles" },
          },
          {
            // Size budget: at most 500 tiles (about 20 MB), oldest dropped first, 30 days.
            urlPattern: /^https:\/\/(tiles\.openfreemap\.org|tiles\.maps\.eox\.at)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-tiles",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 3600,
                purgeOnQuotaError: true,
              },
              // Both hosts send CORS headers; opaque responses would cost about 7 MB of quota each.
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    target: "es2023",
    sourcemap: true,
  },
});
