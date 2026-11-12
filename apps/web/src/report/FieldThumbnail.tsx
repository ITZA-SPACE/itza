import type { FieldPolygon } from "../state";

const SIZE = 100;
const PAD = 8;

/** The outline as SVG points, scaled to fit with north up; longitude shrinks with latitude. */
export function outlinePoints(geometry: FieldPolygon): string {
  const ring = geometry.coordinates[0] ?? [];
  const lat = ring.reduce((sum, p) => sum + (p[1] ?? 0), 0) / Math.max(ring.length, 1);
  const x = ring.map((p) => (p[0] ?? 0) * Math.cos((lat * Math.PI) / 180));
  const y = ring.map((p) => p[1] ?? 0);
  const minX = Math.min(...x);
  const minY = Math.min(...y);
  const scale = (SIZE - 2 * PAD) / Math.max(Math.max(...x) - minX, Math.max(...y) - minY, 1e-9);
  return ring
    .map((_, i) => {
      const px = PAD + ((x[i] ?? 0) - minX) * scale;
      const py = SIZE - PAD - ((y[i] ?? 0) - minY) * scale;
      return `${px.toFixed(1)},${py.toFixed(1)}`;
    })
    .join(" ");
}

/** A map thumbnail of the field that needs no tiles, so it prints and works offline. */
export function FieldThumbnail({ geometry, label }: { geometry: FieldPolygon; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
      className="size-28 rounded-control border border-line bg-surface-muted"
    >
      <polygon
        points={outlinePoints(geometry)}
        className="fill-accent/30 stroke-accent"
        strokeWidth={2}
      />
    </svg>
  );
}
