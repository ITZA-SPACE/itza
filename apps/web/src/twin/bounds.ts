import type { FieldGeometry } from "../data/geometry";

export type Bounds = [west: number, south: number, east: number, north: number];

/** Every ring of a field outline, as `[longitude, latitude]` points. */
export function ringsOf(geometry: FieldGeometry): [number, number][][] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flat().map((ring) => ring.map(([lon, lat]) => [lon as number, lat as number]));
}

export function boundsOf(geometry: FieldGeometry): Bounds {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of ringsOf(geometry)) {
    for (const [lon, lat] of ring) {
      w = Math.min(w, lon);
      e = Math.max(e, lon);
      s = Math.min(s, lat);
      n = Math.max(n, lat);
    }
  }
  return [w, s, e, n];
}

export function centerOf([w, s, e, n]: Bounds): [number, number] {
  return [(w + e) / 2, (s + n) / 2];
}
