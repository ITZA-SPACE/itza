import { areaHa, centroid, perimeterM } from "../data/geometry";
import type { FieldGeometry, FieldPolygon } from "../state";

const SQUARE_SIDE_M = 200;
const METERS_PER_DEGREE = 111_320;

/** Area, centroid and perimeter of an outline (the shared helpers of `src/data`), the moment it changes. */
export function fieldMetrics(
  geometry: FieldPolygon,
  origin: FieldGeometry["origin"],
): Omit<FieldGeometry, "id"> {
  return {
    geometry,
    areaHa: areaHa(geometry),
    centroid: centroid(geometry),
    perimeterM: perimeterM(geometry),
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
