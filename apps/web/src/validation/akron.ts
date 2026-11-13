import type { EngineInput, FieldBundle, RotationResult } from "@itza/engine/contracts";
import { scoreReplay, simulateReplay } from "@itza/engine/replay";

/**
 * USDA-ARS AgResearch Magazine (2011), "Rotations at Akron, Colorado": the long-term dryland
 * rotation trial at the Central Great Plains Research Station. Fetched directly from the source
 * named in docs/FEATURES.md F-22 (https://agresearchmag.ars.usda.gov/2011/jan/rotations); the
 * second citation there (a 2014 conference abstract) returned HTTP 404 and is not used.
 */
export const AKRON_TRIAL = {
  name: "USDA-ARS Akron, Colorado long-term rotation study",
  location: "Central Great Plains Research Station, Akron, Colorado",
  period: "20 years of record by the 2011 report, four full 4-year rotation cycles",
  rotationA: "Wheat-fallow (no-till)",
  rotationB: "Wheat-millet (no-till)",
  /** Direction only; the trial measured net farm income and soil water, not this product's criteria. */
  finding:
    "the no-till wheat-millet rotation out-earned no-till wheat-fallow by about $1,300 a year on a " +
    "160-acre farm, and cut the water lost to bare fallow",
  citationUrl: "https://agresearchmag.ars.usda.gov/2011/jan/rotations",
} as const;

export const AKRON_PACK_ID = "us-central-great-plains";

/**
 * The two rotations named in the trial, in the trial's own crop ids (`packages/knowledge/packs/
 * us-central-great-plains.yaml`): two winter-wheat seasons so both rotations run the same length.
 */
const WHEAT_FALLOW: EngineInput["rotations"][number] = {
  id: "wheat_fallow",
  name: AKRON_TRIAL.rotationA,
  seasons: [{ crop: "winter_wheat" }, { crop: "fallow" }],
};
const WHEAT_MILLET: EngineInput["rotations"][number] = {
  id: "wheat_millet",
  name: AKRON_TRIAL.rotationB,
  seasons: [{ crop: "winter_wheat" }, { crop: "proso_millet" }],
};

export interface AkronComparison {
  /** This product's replay result for each rotation, median composite across the bundle's seasons. */
  wheatFallowMedian: number;
  wheatMilletMedian: number;
  /** Which rotation this product ranks higher. */
  productFavors: "wheat_fallow" | "wheat_millet";
  /** Whether the product's direction matches the trial's (both favor wheat-millet). */
  agrees: boolean;
}

function medianOf(results: readonly RotationResult[], id: string): number {
  const found = results.find((r) => r.rotation_id === id);
  if (!found) throw new Error(`replay did not return a result for rotation ${id}`);
  return found.resilience.median;
}

/**
 * Replays the two Akron rotations with this product's engine on a proof field's own bundle (real
 * weather and NDVI near Akron), under the US Central Great Plains knowledge pack so the crop
 * parameters match the trial's crops.
 */
export function compareToAkron(bundle: FieldBundle): AkronComparison {
  const input: EngineInput = {
    schema: "engine-input/1.0",
    rotations: [WHEAT_FALLOW, WHEAT_MILLET],
    soil: {},
    priorities: {
      water: 3,
      soil_health: 3,
      nitrogen: 3,
      erosion: 3,
      forage: 3,
      income: 3,
      pest_break: 3,
    },
    constraints: { irrigation: { level: "none" }, livestock: false },
    scenario: { id: "history", kind: "history" },
    seed: 42,
  };
  const run = simulateReplay({ bundle, input, packId: AKRON_PACK_ID });
  const output = scoreReplay(run, input.priorities);
  const wheatFallowMedian = medianOf(output.results, "wheat_fallow");
  const wheatMilletMedian = medianOf(output.results, "wheat_millet");
  const productFavors = wheatMilletMedian >= wheatFallowMedian ? "wheat_millet" : "wheat_fallow";
  return {
    wheatFallowMedian,
    wheatMilletMedian,
    productFavors,
    agrees: productFavors === "wheat_millet",
  };
}
