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

type RasterSpec = Extract<StyleSpecification["sources"][string], { type: "raster" }>;

const IMAGERY_SPEC: RasterSpec = {
  type: "raster",
  tiles: [IMAGERY_TILES],
  tileSize: 256,
  maxzoom: 14,
  attribution: IMAGERY_ATTRIBUTION,
};

const US_SOURCE = "usgs-imagery";
const US_LAYER = "usgs-imagery";

/**
 * USGS The National Map orthoimagery (NAIP, about 1 m): public domain, no key. Its tiles stop at
 * zoom 16 over the farm belt, four times sharper than the 10 m Sentinel-2 mosaic at zoom 14. It is
 * laid over EOX inside the lower 48 states only; where it has no tile, EOX shows through.
 */
export const US_IMAGERY_TILES =
  "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}";

export const US_IMAGERY_ATTRIBUTION =
  '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map" target="_blank" rel="noreferrer">USGS The National Map</a>: Orthoimagery (USDA NAIP), public domain';

/** The lower 48 states, so no USGS tile is asked for elsewhere. */
export const US_IMAGERY_BOUNDS: [number, number, number, number] = [-125, 24, -66, 50];

const US_SPEC: RasterSpec = {
  type: "raster",
  tiles: [US_IMAGERY_TILES],
  tileSize: 256,
  maxzoom: 16,
  bounds: US_IMAGERY_BOUNDS,
  attribution: US_IMAGERY_ATTRIBUTION,
};

const IMAGERY_LAYERS = [IMAGERY_LAYER, US_LAYER];

/** What the vector layers were showing, so imagery can hide them and the map can bring them back. */
const hidden = new WeakMap<MapLibreMap, Map<string, "visible" | "none">>();

/** Adds the imagery layers (EOX, then sharper USGS over the US) under the labels, hidden. Call once the style has loaded. */
export function addImagery(map: MapLibreMap): void {
  if (map.getSource(IMAGERY_SOURCE)) return;
  map.addSource(IMAGERY_SOURCE, IMAGERY_SPEC);
  map.addSource(US_SOURCE, US_SPEC);
  const layers = map.getStyle().layers;
  const firstLabel = layers.find((l) => l.type === "symbol")?.id;
  map.addLayer(
    { id: IMAGERY_LAYER, type: "raster", source: IMAGERY_SOURCE, layout: { visibility: "none" } },
    firstLabel,
  );
  map.addLayer(
    { id: US_LAYER, type: "raster", source: US_SOURCE, layout: { visibility: "none" } },
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
  for (const id of IMAGERY_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  }
  const saved = hidden.get(map) ?? new Map<string, "visible" | "none">();
  hidden.set(map, saved);
  for (const layer of map.getStyle().layers) {
    if (
      IMAGERY_LAYERS.includes(layer.id) ||
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
