import type { FieldPolygon } from "./types";

const DECIMALS = 5;

/** Rounds coordinates to about a metre, so a tiny edit of a vertex does not make a different field. */
function rounded(polygon: FieldPolygon): number[][][] {
  const k = 10 ** DECIMALS;
  return polygon.coordinates.map((ring) =>
    ring.map(([x, y]) => [Math.round((x as number) * k) / k, Math.round((y as number) * k) / k]),
  );
}

/** `sha256:<hex>` of the rounded outline: the field id of the bundle contract. */
export async function fieldIdOf(polygon: FieldPolygon): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(rounded(polygon)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
