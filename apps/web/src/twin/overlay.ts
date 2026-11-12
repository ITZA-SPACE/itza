import type { LayersList } from "@deck.gl/core";
import { PathLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { IControl, Map as MapLibreMap } from "maplibre-gl";
import type { FieldGeometry } from "../data/geometry";
import { ringsOf } from "./bounds";

const OUTLINE_RGB: [number, number, number] = [8, 67, 127];

/** deck.gl drawn inside the map's own WebGL context, so layers share its camera and terrain depth. */
export function createOverlay(map: MapLibreMap): MapboxOverlay {
  const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
  map.addControl(overlay as unknown as IControl);
  return overlay;
}

/**
 * The field outline lifted onto the terrain surface. `queryTerrainElevation` already includes the
 * exaggeration, so the line follows the ground at any setting.
 */
export function outlineLayers(map: MapLibreMap, geometry: FieldGeometry): LayersList {
  const paths = ringsOf(geometry).map((ring) => ({
    path: ring.map(([lng, lat]) => [lng, lat, (map.queryTerrainElevation({ lng, lat }) ?? 0) + 2]),
  }));
  return [
    new PathLayer({
      id: "field-outline",
      data: paths,
      getPath: (d) => d.path as [number, number, number][],
      getColor: [...OUTLINE_RGB, 255],
      getWidth: 4,
      widthUnits: "pixels",
      // Terrain tiles are coarse; the outline must never sink under a ridge between two vertices.
      parameters: { depthCompare: "always" },
    }),
  ];
}
