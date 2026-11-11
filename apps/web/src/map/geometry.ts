import area from "@turf/area";
import centroid from "@turf/centroid";
import { lineString, polygon } from "@turf/helpers";
import length from "@turf/length";
import type { FieldGeometry, FieldPolygon } from "../state";

const SQUARE_SIDE_M = 200;
const METERS_PER_DEGREE = 111_320;

/** Area, centroid and perimeter of an outline, computed on the sphere (Turf) the moment it changes. */
export function fieldMetrics(
  geometry: FieldPolygon,
  origin: FieldGeometry["origin"],
): Omit<FieldGeometry, "id"> {
  const feature = polygon(geometry.coordinates);
  const [lon, lat] = centroid(feature).geometry.coordinates as [number, number];
  const exterior = geometry.coordinates[0] ?? [];
  return {
    geometry,
    areaHa: area(feature) / 10_000,
    centroid: [lon, lat],
    perimeterM: exterior.length > 1 ? length(lineString(exterior), { units: "meters" }) : 0,
    origin,
  };
}

/** A 200 m square centred on a point: the default field when the farmer only marks where it is. */
export function squareAround([lon, lat]: [number, number], sideM = SQUARE_SIDE_M): FieldPolygon {
  const dLat = sideM / 2 / METERS_PER_DEGREE;
  const dLon = sideM / 2 / (METERS_PER_DEGREE * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));
  const [w, e, s, n] = [lon - dLon, lon + dLon, lat - dLat, lat + dLat];
  return {
    type: "Polygon",
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  };
}

/** Bounding box `[west, south, east, north]` of an outline. */
export function boundsOf(geometry: FieldPolygon): [number, number, number, number] {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of geometry.coordinates[0] ?? []) {
    w = Math.min(w, x as number);
    e = Math.max(e, x as number);
    s = Math.min(s, y as number);
    n = Math.max(n, y as number);
  }
  return [w, s, e, n];
}
