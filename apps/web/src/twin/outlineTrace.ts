import type { Map as MapLibreMap } from "maplibre-gl";
import type { FieldGeometry } from "../data/geometry";
import { prefersReducedMotion } from "./camera";
import { setOutline } from "./outline";

type Point = [number, number];

/** Points on each ring while morphing: enough for a smooth curve on any field outline. */
const SAMPLES = 160;
const TRACE_MS = 1800;

/** `count` points spaced evenly along the closed ring, the first at the ring's first vertex. */
export function resample(ring: readonly Point[], count: number): Point[] {
  const closed = ring.length > 1 ? [...ring, ring[0] as Point] : [...ring];
  const lengths = [0];
  for (let i = 1; i < closed.length; i++) {
    const [ax, ay] = closed[i - 1] as Point;
    const [bx, by] = closed[i] as Point;
    lengths.push((lengths[i - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  if (total === 0) return Array.from({ length: count }, () => [...(ring[0] ?? [0, 0])] as Point);
  const out: Point[] = [];
  let segment = 1;
  for (let k = 0; k < count; k++) {
    const at = (k / count) * total;
    while (segment < closed.length - 1 && (lengths[segment] ?? 0) < at) segment++;
    const start = lengths[segment - 1] ?? 0;
    const span = (lengths[segment] ?? 0) - start;
    const f = span > 0 ? (at - start) / span : 0;
    const [ax, ay] = closed[segment - 1] as Point;
    const [bx, by] = closed[segment] as Point;
    out.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
  }
  return out;
}

/** The ring's bounding box as a ring, starting at its north-west corner and running clockwise. */
export function boxOf(ring: readonly Point[]): Point[] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [w, e, s, n] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ];
}

/** The ring rotated to start at its vertex nearest `target`, so the morph does not twist. */
export function startNear(ring: readonly Point[], target: Point): Point[] {
  const open =
    ring.length > 1 &&
    ring[0]?.[0] === ring[ring.length - 1]?.[0] &&
    ring[0]?.[1] === ring[ring.length - 1]?.[1]
      ? ring.slice(0, -1)
      : [...ring];
  let best = 0;
  open.forEach((p, i) => {
    const q = open[best] as Point;
    if (
      Math.hypot(p[0] - target[0], p[1] - target[1]) <
      Math.hypot(q[0] - target[0], q[1] - target[1])
    )
      best = i;
  });
  return [...open.slice(best), ...open.slice(0, best)];
}

/** Signed area: positive when counter-clockwise (lon/lat axes). */
function signedArea(ring: readonly Point[]): number {
  let sum = 0;
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length] as Point;
    sum += p[0] * q[1] - q[0] * p[1];
  });
  return sum / 2;
}

/**
 * The rectangle-to-field morph: both rings resampled to the same number of points, the field ring
 * turned clockwise and started at its vertex nearest the box's north-west corner. `frame(t)` gives
 * the closed ring at `t` from 0 (box) to 1 (field).
 */
export function morph(ring: readonly Point[]): (t: number) => Point[] {
  const box = boxOf(ring);
  let field = startNear(ring, box[0] as Point);
  if (signedArea(field) > 0) field = [field[0] as Point, ...field.slice(1).reverse()];
  const from = resample(box, SAMPLES);
  const to = resample(field, SAMPLES);
  return (t) => {
    const ring = from.map((a, i) => {
      const b = to[i] as Point;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point;
    });
    return [...ring, ring[0] as Point];
  };
}

/** A closed morph ring as a field polygon; `morph` always returns at least SAMPLES + 1 points. */
const polygon = (ring: Point[]) =>
  ({ type: "Polygon", coordinates: [ring] }) as unknown as FieldGeometry;

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Animates a field outline from its bounding rectangle into the real boundary: `draw` gets each
 * in-between ring, then `done` once the real outline should be drawn. Reduced motion, or a field
 * that is not a single polygon, calls `done` at once. Returns a cancel function that calls `done`.
 */
export function traceRing(
  geometry: FieldGeometry,
  draw: (ring: Point[]) => void,
  done: () => void,
): () => void {
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : undefined;
  if (!ring || ring.length < 4 || prefersReducedMotion()) {
    done();
    return () => {};
  }
  const frame = morph(ring as Point[]);
  let raf = 0;
  let started: number | null = null;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    done();
  };
  const step = (now: number) => {
    started ??= now;
    const t = Math.min(1, (now - started) / TRACE_MS);
    if (t >= 1) {
      finish();
      return;
    }
    draw(frame(ease(t)));
    raf = requestAnimationFrame(step);
  };
  draw(frame(0));
  raf = requestAnimationFrame(step);
  return finish;
}

/** `traceRing` for the MapLibre twin: the outline layer follows the morph. */
export function traceOutline(map: MapLibreMap, geometry: FieldGeometry): () => void {
  return traceRing(
    geometry,
    (ring) => setOutline(map, polygon(ring)),
    () => {
      if (map.getContainer().isConnected) setOutline(map, geometry);
    },
  );
}
