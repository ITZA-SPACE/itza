import type { Map as MapLibreMap } from "maplibre-gl";
import { zoneColor } from "../zones/overlay";
import type { ZoneCollection } from "../zones/types";
import type { TerrainProducts } from "./terrainData";

export type OverlayId = "flow" | "slope" | "frost" | "zones";
export const OVERLAYS: readonly OverlayId[] = ["flow", "slope", "frost", "zones"];

/** Swatches of the slope-class and frost-pocket previews, as the science API paints them. */
export const SLOPE_COLORS = ["#4caf50", "#cddc39", "#ff9800", "#c62828"] as const;
export const FROST_COLORS = { low: "#2166ac", high: "#b2182b" } as const;

const HILLSHADE_LAYER = "terrain-hillshade";
const prefix = "twin-overlay-";

type Bounds = [west: number, south: number, east: number, north: number];
const corners = ([w, s, e, n]: Bounds): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] => [
  [w, n],
  [e, n],
  [e, s],
  [w, s],
];

/** Adds a layer just under the hillshade: over the draped frames, still shaded by the relief. */
function add(map: MapLibreMap, layer: Parameters<MapLibreMap["addLayer"]>[0]): void {
  map.addLayer(layer, map.getLayer(HILLSHADE_LAYER) ? HILLSHADE_LAYER : undefined);
}

function addImage(
  map: MapLibreMap,
  id: string,
  url: string,
  bounds: Bounds,
  opacity: number,
): void {
  if (map.getSource(id)) return;
  map.addSource(id, { type: "image", url, coordinates: corners(bounds) });
  add(map, {
    id,
    type: "raster",
    source: id,
    paint: { "raster-opacity": opacity, "raster-fade-duration": 0, "raster-resampling": "nearest" },
    layout: { visibility: "none" },
  });
}

/** Sources and layers of one field's overlays, created once its data arrives and hidden until chosen. */
export function ensureOverlays(
  map: MapLibreMap,
  data: { terrain: TerrainProducts | undefined; zones: ZoneCollection | undefined },
): void {
  const { terrain, zones } = data;
  const bounds = terrain?.displayBounds;
  if (terrain?.available && bounds) {
    if (terrain.images.slope_class) {
      addImage(map, `${prefix}slope`, terrain.images.slope_class, bounds, 0.6);
    }
    if (terrain.images.concavity) {
      addImage(map, `${prefix}frost`, terrain.images.concavity, bounds, 0.65);
    }
    if (terrain.images.accumulation) {
      addImage(map, `${prefix}flow-accumulation`, terrain.images.accumulation, bounds, 0.6);
    }
    if (!map.getSource(`${prefix}flow`)) {
      map.addSource(`${prefix}flow`, { type: "geojson", data: terrain.flowLines });
      add(map, {
        id: `${prefix}flow`,
        type: "line",
        source: `${prefix}flow`,
        layout: { visibility: "none", "line-cap": "round" },
        paint: {
          "line-color": "#1d4ed8",
          "line-opacity": 0.9,
          "line-width": [
            "interpolate",
            ["linear"],
            ["get", "upstream_cells"],
            10,
            1.5,
            100,
            3,
            1000,
            6,
          ],
        },
      });
    }
  }
  if (zones?.enabled && zones.features.length > 0 && !map.getSource(`${prefix}zones`)) {
    map.addSource(`${prefix}zones`, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: zones.features.map((f) => ({
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { color: zoneColor(f.properties.zone) },
        })),
      },
    });
    add(map, {
      id: `${prefix}zones`,
      type: "fill",
      source: `${prefix}zones`,
      layout: { visibility: "none" },
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.5 },
    });
    add(map, {
      id: `${prefix}zones-edge`,
      type: "line",
      source: `${prefix}zones`,
      layout: { visibility: "none" },
      paint: { "line-color": ["get", "color"], "line-width": 2 },
    });
  }
}

const LAYERS: Record<OverlayId, string[]> = {
  flow: [`${prefix}flow-accumulation`, `${prefix}flow`],
  slope: [`${prefix}slope`],
  frost: [`${prefix}frost`],
  zones: [`${prefix}zones`, `${prefix}zones-edge`],
};

export function setOverlayVisible(map: MapLibreMap, id: OverlayId, visible: boolean): void {
  for (const layer of LAYERS[id]) {
    if (map.getLayer(layer))
      map.setLayoutProperty(layer, "visibility", visible ? "visible" : "none");
  }
}

/** Removes every overlay source and layer (the map goes away with the page, but a field can change). */
export function removeOverlays(map: MapLibreMap): void {
  for (const layer of Object.values(LAYERS).flat()) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  for (const source of [
    `${prefix}slope`,
    `${prefix}frost`,
    `${prefix}flow-accumulation`,
    `${prefix}flow`,
    `${prefix}zones`,
  ]) {
    if (map.getSource(source)) map.removeSource(source);
  }
}
