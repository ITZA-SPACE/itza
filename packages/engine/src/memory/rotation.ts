import type { RotationPattern, SeasonLabel } from "./types";

/** Share of labelled seasons that must follow the cycle for it to count as a rotation. */
const MIN_AGREEMENT = 0.8;
const MAX_PERIOD = 4;

/**
 * Smallest cycle (1 to 4 seasons) that at least 80 % of the labelled seasons follow, found by
 * taking the most common label at each phase. `uncertain` seasons keep their slot but do not vote.
 * Needs two full cycles of evidence; otherwise the rotation is irregular.
 */
export function inferRotation(labels: SeasonLabel[]): RotationPattern {
  const voters = labels.filter((l) => l !== "uncertain").length;
  let best: RotationPattern = { kind: "irregular", period: null, pattern: [], agreement: 0 };
  for (let p = 1; p <= MAX_PERIOD && labels.length >= 2 * p; p++) {
    const pattern: SeasonLabel[] = [];
    let matched = 0;
    for (let phase = 0; phase < p; phase++) {
      const counts = new Map<SeasonLabel, number>();
      for (let i = phase; i < labels.length; i += p) {
        const l = labels[i] as SeasonLabel;
        if (l !== "uncertain") counts.set(l, (counts.get(l) ?? 0) + 1);
      }
      let top: SeasonLabel = "uncertain";
      let topCount = 0;
      for (const [l, c] of counts) {
        if (c > topCount) {
          top = l;
          topCount = c;
        }
      }
      pattern.push(top);
      matched += topCount;
    }
    const agreement = voters === 0 ? 0 : matched / voters;
    if (agreement > best.agreement) best = { ...best, agreement };
    if (agreement >= MIN_AGREEMENT && !pattern.includes("uncertain")) {
      const kind =
        p === 1
          ? "continuous"
          : pattern.includes("fallow_or_bare")
            ? "fallow_rotation"
            : "crop_rotation";
      return { kind, period: p, pattern, agreement: Math.round(agreement * 1000) / 1000 };
    }
  }
  return { ...best, agreement: Math.round(best.agreement * 1000) / 1000 };
}
