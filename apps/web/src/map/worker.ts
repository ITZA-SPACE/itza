import { setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

// MapLibre 6 starts its tile worker from a URL it cannot resolve once bundled. Vite emits the worker
// (with the modules it shares) as an asset and gives the URL, in dev and in the production build.
setWorkerUrl(workerUrl);
