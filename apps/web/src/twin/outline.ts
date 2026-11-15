import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { FieldGeometry } from "../data/geometry";

const SOURCE = "field-outline";
const CASING = "field-outline-casing";
const OUTLINE = "#79ffae";

/**
 * The field outline as MapLibre line layers on top of the style. MapLibre drapes them on the terrain
 * together with the frames, so a frame never covers the outline (a deck.gl layer is drawn before the
 * draped rasters and would sit under them).
 */
export function setOutline(map: MapLibreMap, geometry: FieldGeometry): void {
  const data = { type: "Feature" as const, properties: {}, geometry };
  const source = map.getSource(SOURCE) as GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
    return;
  }
  map.addSource(SOURCE, { type: "geojson", data });
  const layout = { "line-join": "round" } as const;
  map.addLayer({
    id: CASING,
    type: "line",
    source: SOURCE,
    layout,
    paint: { "line-color": "#06060b", "line-width": 7 },
  });
  map.addLayer({
    id: SOURCE,
    type: "line",
    source: SOURCE,
    layout,
    paint: { "line-color": OUTLINE, "line-width": 3.5 },
  });
}

/** Puts the outline back on top of layers added after it. */
export function raiseOutline(map: MapLibreMap): void {
  for (const id of [CASING, SOURCE]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}
