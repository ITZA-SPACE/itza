type Ring = number[][];

/** The part of a ring on one side of a vertical line (Sutherland-Hodgman); empty when none is. */
export function clipRing(ring: Ring, lon: number, keep: "west" | "east"): Ring {
  const inside = (p: number[]) =>
    keep === "west" ? (p[0] as number) <= lon : (p[0] as number) >= lon;
  const out: Ring = [];
  const pts = ring.slice(0, -1);
  for (const [i, cur] of pts.entries()) {
    const prev = pts[(i + pts.length - 1) % pts.length] as number[];
    if (inside(cur) !== inside(prev)) {
      const k = (lon - (prev[0] as number)) / ((cur[0] as number) - (prev[0] as number));
      out.push([lon, (prev[1] as number) + k * ((cur[1] as number) - (prev[1] as number))]);
    }
    if (inside(cur)) out.push(cur);
  }
  return out.length < 3 ? [] : [...out, out[0] as number[]];
}
