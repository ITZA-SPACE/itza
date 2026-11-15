import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/** OpenFreeMap vector style: no key, no sign-up. "Dark" matches the app's night theme. */
export const VECTOR_STYLE = "https://tiles.openfreemap.org/styles/dark";

const IMAGERY_SOURCE = "eox-s2cloudless-2016";
const IMAGERY_LAYER = "eox-s2cloudless-2016";

/**
 * EOxCloudless 2016 (Sentinel-2 cloudless, WMTS layer `s2cloudless_3857`). EOX licenses this year
 * under CC BY 4.0, which only asks for attribution; its 2018 to 2025 mosaics are non-commercial and
 * must not be used here (EOX license page: https://cloudless.eox.at/license-non-commercial).
 */
export const IMAGERY_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg";

/** The attribution EOX requires for the 2016 layer, with its license, shown on the map. */
export const IMAGERY_ATTRIBUTION =
  '<a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless</a> by <a href="https://eox.at" target="_blank" rel="noreferrer">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017), <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>';

const IMAGERY_SPEC: Extract<StyleSpecification["sources"][string], { type: "raster" }> = {
  type: "raster",
  tiles: [IMAGERY_TILES],
  tileSize: 256,
  maxzoom: 14,
  attribution: IMAGERY_ATTRIBUTION,
};

/** What the vector layers were showing, so imagery can hide them and the map can bring them back. */
const hidden = new WeakMap<MapLibreMap, Map<string, "visible" | "none">>();

/** Adds the imagery layer under the labels, hidden. Call once the style has loaded. */
export function addImagery(map: MapLibreMap): void {
  if (map.getSource(IMAGERY_SOURCE)) return;
  map.addSource(IMAGERY_SOURCE, IMAGERY_SPEC);
  const layers = map.getStyle().layers;
  const firstLabel = layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: IMAGERY_LAYER, type: "raster", source: IMAGERY_SOURCE, layout: { visibility: "none" } },
    firstLabel,
  );
}

/** Layers other features add above the basemap (drawing tools, the 3D twin's frames and outline) stay as they are. */
const KEPT_PREFIXES = ["td-", "twin-", "field-outline"];

/**
 * Shows satellite imagery or the vector map. The vector fills and lines are hidden under the imagery
 * while labels stay, and the layers other features added above (see `KEPT_PREFIXES`) are left alone, so switching never
 * loses the field.
 */
export function showImagery(map: MapLibreMap, on: boolean): void {
  if (!map.getLayer(IMAGERY_LAYER)) return;
  map.setLayoutProperty(IMAGERY_LAYER, "visibility", on ? "visible" : "none");
  const saved = hidden.get(map) ?? new Map<string, "visible" | "none">();
  hidden.set(map, saved);
  for (const layer of map.getStyle().layers) {
    if (
      layer.id === IMAGERY_LAYER ||
      layer.type === "symbol" ||
      KEPT_PREFIXES.some((p) => layer.id.startsWith(p))
    )
      continue;
    if (on) {
      if (!saved.has(layer.id)) {
        saved.set(
          layer.id,
          (map.getLayoutProperty(layer.id, "visibility") as "visible" | "none") ?? "visible",
        );
      }
      map.setLayoutProperty(layer.id, "visibility", "none");
    } else {
      const before = saved.get(layer.id);
      if (before) map.setLayoutProperty(layer.id, "visibility", before);
      saved.delete(layer.id);
    }
  }
}
