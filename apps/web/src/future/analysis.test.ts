import type { FutureResult } from "@itza/engine/worker";
import { describe, expect, it } from "vitest";
import { direction, headline, outlook, percent, shortNames } from "./analysis";

const shift = (
  id: string,
  score: number,
  median: number,
  min: number,
  max: number,
  drought = 0,
) => ({
  rotation_id: id,
  history: { score, p10: score, worst: score, severe_water_stress_seasons: 2 },
  score: { median, min, max },
  p10: { median: 0, min: 0, max: 0 },
  worst: { median: 0, min: 0, max: 0 },
  severe_water_stress_seasons: drought,
});

// The real Akron proof field 1 replay (live screen, 2026-11-15).
const future = {
  progress: 1,
  provenance: {} as FutureResult["provenance"],
  ssps: [
    {
      ssp: "ssp126",
      rotations: [
        shift("pea", 0.59, 0, -0.01, 0, -1),
        shift("sun", 0.59, -0.03, -0.03, -0.02),
        shift("tf", 0.57, 0, 0, 0.01),
      ],
    },
    {
      ssp: "ssp245",
      rotations: [
        shift("pea", 0.59, -0.01, -0.02, 0),
        shift("sun", 0.59, -0.03, -0.03, -0.03),
        shift("tf", 0.57, 0, -0.01, 0.01),
      ],
    },
  ],
  climate: [
    {
      id: "today",
      seasons: [
        { label: "2008-09", meanTempC: 10, rainMm: 400 },
        { label: "2009-10", meanTempC: 11, rainMm: 600 },
      ],
    },
    {
      id: "ssp245",
      seasons: [
        { label: "2008-09", meanTempC: 11.5, rainMm: 380 },
        { label: "2009-10", meanTempC: 12.9, rainMm: 570 },
      ],
    },
  ],
} as unknown as FutureResult;

const rotations = [
  { id: "pea", name: "Pea rotation", isBaseline: true },
  { id: "sun", name: "Sunflower rotation", isBaseline: false },
  { id: "tf", name: "Wheat, triticale, fallow", isBaseline: false },
];

describe("2050 outlook", () => {
  it("reports scores out of 100, % change of today and shared ranks for ties", () => {
    const rows = outlook(future, rotations, "ssp245");
    const sun = rows.find((r) => r.id === "sun");
    expect(sun).toMatchObject({ today: 59, future: 56, rankToday: 1, rankFuture: 3 });
    expect(sun?.change.median).toBeCloseTo(-5.08, 1);
    expect(rows.find((r) => r.id === "pea")?.rankToday).toBe(1); // tied with the sunflower rotation
    expect(rows.find((r) => r.id === "tf")?.rankFuture).toBe(2);
  });

  it("shows today's scores without change for the Today view", () => {
    const rows = outlook(future, rotations, null);
    expect(rows.every((r) => r.future === r.today && r.change.median === 0)).toBe(true);
  });

  it("names the robust rotation, the largest loss, rank moves and the season climate change", () => {
    const h = headline(future, rotations, "ssp245");
    expect(h.best?.id).toBe("pea");
    expect(h.bestEverywhere).toBe(true);
    expect(h.largestLoss?.id).toBe("sun");
    expect(h.rankMoves).toBe(2);
    expect(h.current?.id).toBe("pea"); // the baseline rotation
    expect(h.warmingC).toBeCloseTo(1.7, 5);
    expect(h.rainPct).toBeCloseTo(-5, 5);
  });

  it("formats changes without false precision and only calls material changes a move", () => {
    expect(percent(-5.08)).toBe("−5%");
    expect(percent(0.4)).toBe("0%");
    expect(percent(2)).toBe("+2%");
    expect(direction(-5)).toBe("down");
    expect(direction(-2)).toBe("flat");
  });
});

describe("short rotation names", () => {
  it("names each rotation by the crops that set it apart, rarest first", () => {
    const names = [
      "Winter wheat, Proso millet, Winter triticale, Fallow, Field pea",
      "Winter wheat, Proso millet, Winter triticale, Sunflower, Fallow",
      "Winter wheat, Winter triticale, Fallow",
      "Winter wheat, Winter triticale, Corn (dryland), Proso millet, Field pea",
    ];
    expect(shortNames(names)).toEqual([
      "Field pea + Proso millet",
      "Sunflower + Proso millet",
      "Winter wheat · Winter triticale · Fallow",
      "Corn (dryland) + Field pea",
    ]);
  });
});
