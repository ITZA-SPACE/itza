import { describe, expect, it } from "vitest";
import {
  type CropSegment,
  seasonLength,
  simulateTimeline,
  soilParams,
  toDayNumber,
} from "../../src/physics";
import { loadBundle, packCrop } from "./helpers";

describe("benchmark", () => {
  it("25 seasons of daily physics for a wheat-millet-fallow rotation take under 20 ms", () => {
    const wheat = packCrop("us-central-great-plains", "winter_wheat");
    const millet = packCrop("us-central-great-plains", "proso_millet");
    const soil = soilParams(loadBundle("semi-arid-winter-cereal").soil);
    const years = 25;
    const startDay = toDayNumber("2000-01-01");
    const days = 365 * years + 7;
    const precip = Float64Array.from({ length: days }, (_, i) => (i % 7 === 0 ? 6 + (i % 13) : 0));
    const et0 = Float64Array.from(
      { length: days },
      (_, i) => 1 + 5 * Math.sin((Math.PI * (i % 365)) / 365) ** 2,
    );

    // Wheat sown in September, harvested the next July; millet two years later; fallow between.
    const segments: CropSegment[] = [];
    for (let year = 0; year + 2 < years; year += 3) {
      segments.push({ crop: wheat, sowingDay: startDay + year * 365 + 255 });
      segments.push({ crop: millet, sowingDay: startDay + (year + 2) * 365 + 150 });
    }
    const run = () => simulateTimeline({ startDay, precip, et0, soil, segments });

    run(); // warm up the JIT
    const times: number[] = [];
    for (let i = 0; i < 7; i++) {
      const t0 = performance.now();
      run();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = times[3] as number;
    expect(run().segments.length).toBeGreaterThanOrEqual(14);
    expect(seasonLength(wheat)).toBeGreaterThan(200);
    expect(median).toBeLessThan(20);
  });
});
