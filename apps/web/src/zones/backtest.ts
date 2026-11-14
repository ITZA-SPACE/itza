import type { EngineInput, FieldBundle } from "@itza/engine/contracts";
import { scoreReplay, simulateReplay } from "@itza/engine/replay";
import { loadPack, packForLocation } from "@itza/knowledge";
import type { ZoneFeature } from "./types";

export interface ZoneBacktest {
  zone: number;
  crop: string;
  seasons: { season: string; score: number }[];
  mean: number;
}

const PRIORITIES = {
  water: 3,
  soil_health: 3,
  nitrogen: 3,
  erosion: 3,
  forage: 3,
  income: 3,
  pest_break: 3,
} as const;

/** The bundle with one zone's slope and soil water in place of the field means. */
export function zoneBundle(bundle: FieldBundle, zone: ZoneFeature): FieldBundle {
  const { slope_deg, soil_water } = zone.properties;
  return {
    ...bundle,
    field: { ...bundle.field, slope_mean_deg: slope_deg ?? bundle.field.slope_mean_deg },
    soil: soil_water
      ? {
          ...bundle.soil,
          awc_mm_per_m: {
            value: soil_water.awc_mm_per_m,
            source: soil_water.label,
            confidence: "low",
          },
        }
      : bundle.soil,
  };
}

/**
 * Replays one reference crop through every past season for each zone, nominally (no Monte Carlo).
 * Only slope and soil water differ between zones, so the spread shows terrain, not crop choice.
 */
export function zoneBacktests(bundle: FieldBundle, zones: ZoneFeature[]): ZoneBacktest[] {
  const [lon, lat] = bundle.field.centroid;
  const pack = loadPack(packForLocation(lon, lat).pack.id);
  const crop = pack.crops.find((c) => c.kind === "crop");
  if (!crop) return [];
  const input: EngineInput = {
    schema: "engine-input/1.0",
    rotations: [{ id: "reference", seasons: [{ crop: crop.id }] }],
    soil: bundle.soil,
    priorities: PRIORITIES,
    constraints: { irrigation: { level: "none" }, livestock: false },
    scenario: { id: "history", kind: "history" },
    seed: 42,
    monte_carlo_draws: 0,
  };
  return zones.map((zone) => {
    const run = simulateReplay({ bundle: zoneBundle(bundle, zone), input });
    const seasons = (scoreReplay(run, PRIORITIES).results[0]?.seasons ?? []).map((s) => ({
      season: s.season,
      score: s.composite,
    }));
    const mean = seasons.reduce((a, s) => a + s.score, 0) / Math.max(1, seasons.length);
    return { zone: zone.properties.zone, crop: crop.id, seasons, mean };
  });
}
