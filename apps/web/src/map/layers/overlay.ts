import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import { useFieldStore } from "../../state";
import { boundsOf } from "../geometry";
import { clipRing } from "./clip";
import { modisPixels, powerCell, smapCell } from "./footprints";
import { useLayerState } from "./layerStore";
import { useLayers } from "./useLayers";

const FILL = "itza-layers";
const SPLIT = "itza-split";
const FOOT = "itza-footprints";
export const FOOTPRINT_COLORS = { smap: "#7a2e8e", power: "#c2570c", modis: "#0b6b4f" } as const;

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function ensure(map: MapLibreMap) {
  if (map.getSource(FILL)) return;
  // Under Terra Draw's layers, so the outline stays on top and editable.
  const before = map.getStyle().layers.find((l) => l.id.startsWith("td-"))?.id;
  for (const id of [FILL, SPLIT, FOOT]) map.addSource(id, { type: "geojson", data: empty });
  map.addLayer(
    {
      id: FILL,
      type: "fill",
      source: FILL,
      paint: { "fill-color": ["get", "color"], "fill-opacity": 0.65 },
    },
    before,
  );
  map.addLayer(
    {
      id: FOOT,
      type: "line",
      source: FOOT,
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["==", ["get", "kind"], "modis"], 1.5, 3],
        "line-dasharray": [2, 1],
      },
    },
    before,
  );
  map.addLayer(
    { id: SPLIT, type: "line", source: SPLIT, paint: { "line-color": "#ffffff", "line-width": 3 } },
    before,
  );
}

function setData(map: MapLibreMap, id: string, features: object[]) {
  const source = map.getSource(id) as { setData: (d: unknown) => void } | undefined;
  source?.setData({ type: "FeatureCollection", features });
}

/** Draws the active layer (or two halves when comparing), the divider and the pixel footprints. */
export function useLayerOverlay(map: MapLibreMap | null, ready: boolean): void {
  const geometry = useFieldStore((s) => s.field?.geometry);
  const centroid = useFieldStore((s) => s.field?.centroid);
  const { a, b } = useLayers();
  const split = useLayerState((s) => s.split);
  const footprints = useLayerState((s) => s.footprints);

  useEffect(() => {
    if (!map || !ready) return;
    ensure(map);
    const ring = geometry ? (geometry.coordinates[0] as number[][]) : null;
    const polygon = (r: number[][], color: string) => ({
      type: "Feature",
      properties: { color },
      geometry: { type: "Polygon", coordinates: [r] },
    });
    const fills: object[] = [];
    const lines: object[] = [];
    if (ring && geometry) {
      const [w, s, e, n] = boundsOf(geometry);
      if (b) {
        const lon = w + split * (e - w);
        const west = clipRing(ring, lon, "west");
        const east = clipRing(ring, lon, "east");
        if (a?.color && west.length) fills.push(polygon(west, a.color));
        if (b.color && east.length) fills.push(polygon(east, b.color));
        lines.push({
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [
              [lon, s],
              [lon, n],
            ],
          },
        });
      } else if (a?.color) {
        fills.push(polygon(ring, a.color));
      }
    }
    setData(map, FILL, fills);
    setData(map, SPLIT, lines);

    const feet: object[] = [];
    if (geometry && centroid) {
      const [lon, lat] = centroid;
      const add = (kind: keyof typeof FOOTPRINT_COLORS, rings: number[][][]) => {
        for (const r of rings)
          feet.push({
            type: "Feature",
            properties: { kind, color: FOOTPRINT_COLORS[kind] },
            geometry: { type: "LineString", coordinates: r },
          });
      };
      if (footprints.smap) add("smap", [smapCell(lon, lat)]);
      if (footprints.power) add("power", [powerCell(lon, lat)]);
      if (footprints.modis) add("modis", modisPixels(boundsOf(geometry)));
    }
    setData(map, FOOT, feet);
  }, [map, ready, geometry, centroid, a, b, split, footprints]);
}
