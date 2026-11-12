import type { Map as MapLibreMap } from "maplibre-gl";
import type { FieldPolygon } from "../../state";

const SOURCE = "click-to-field-proposal";
const FILL = "click-to-field-proposal-fill";
const LINE = "click-to-field-proposal-line";

const empty = { type: "FeatureCollection", features: [] } as const;

/** Draws the proposed outline (dashed, so it reads as not yet accepted) above the basemap. */
export function showProposal(map: MapLibreMap, geometry: FieldPolygon): void {
  const data = {
    type: "FeatureCollection" as const,
    features: [{ type: "Feature" as const, properties: {}, geometry }],
  };
  const source = map.getSource(SOURCE);
  if (source && "setData" in source) {
    (source as { setData: (data: unknown) => void }).setData(data);
    return;
  }
  map.addSource(SOURCE, { type: "geojson", data });
  map.addLayer({
    id: FILL,
    type: "fill",
    source: SOURCE,
    paint: { "fill-color": "#c2410c", "fill-opacity": 0.2 },
  });
  map.addLayer({
    id: LINE,
    type: "line",
    source: SOURCE,
    paint: { "line-color": "#c2410c", "line-width": 3, "line-dasharray": [2, 2] },
  });
}

export function clearProposal(map: MapLibreMap): void {
  const source = map.getSource(SOURCE);
  if (source && "setData" in source) {
    (source as { setData: (data: unknown) => void }).setData(empty);
  }
}
