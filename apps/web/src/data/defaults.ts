import { HttpClient, loadRegistry } from "@itza/adapters-browser";
import manifestText from "../../../../data-sources.yaml?raw";
import { config } from "../lib/config";
import { idbCache } from "./cache";
import { createBundleLoader } from "./loader";

/** The app's loader: real adapters, the science API from build-time config, IndexedDB cache. */
export const loadFieldBundle = createBundleLoader({
  registry: loadRegistry(manifestText, { http: new HttpClient() }),
  science: {
    baseUrl: config.scienceApiUrl,
    fetch: (input, init) => fetch(input, init),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    timeoutMs: 120_000,
  },
  cache: idbCache,
  fetch: (input, init) => fetch(input, init),
  heroBaseUrl: `${import.meta.env.BASE_URL}bundles`.replace(/\/\//g, "/"),
  now: () => new Date(),
});
