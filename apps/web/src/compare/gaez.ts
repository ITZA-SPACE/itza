import type { CropEntry, KnowledgePack } from "@itza/knowledge";

export type GaezEvidence = NonNullable<CropEntry["gaez_suitability"]>;

/** The native 30-arc-second all-land grid is anchored at (-180, 90).
 * A point sample only applies within its own cell; it cannot describe the whole pack.
 */
export function inGaezCell(
  centroid: readonly [number, number] | undefined,
  evidence: GaezEvidence,
): boolean {
  if (!centroid?.every(Number.isFinite)) return false;
  const [lon, lat] = centroid;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
  const scale = 3600 / evidence.resolution_arc_seconds;
  const cell = (longitude: number, latitude: number) => [
    Math.floor((longitude + 180) * scale),
    Math.floor((90 - latitude) * scale),
  ];
  const target = cell(lon, lat);
  const sampled = cell(evidence.location.longitude, evidence.location.latitude);
  return target[0] === sampled[0] && target[1] === sampled[1];
}

/** Only crops actually replayed on this card, once each. No scores or candidates change. */
export function gaezCrops(pack: KnowledgePack, cropIds: readonly string[]) {
  const grown = new Set(cropIds);
  return pack.crops.flatMap((crop) =>
    grown.has(crop.id) && crop.gaez_suitability ? [{ crop, evidence: crop.gaez_suitability }] : [],
  );
}
