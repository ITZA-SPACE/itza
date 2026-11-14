import { describe, expect, it } from "vitest";
import type { SeasonLabel } from "../../src/memory";
import { cropId, inferRotation } from "../../src/memory";

const W: SeasonLabel = "winter_crop";
const F: SeasonLabel = "fallow_or_bare";
const S: SeasonLabel = "summer_crop";
const U: SeasonLabel = "uncertain";

describe("inferRotation", () => {
  it("finds a two-season fallow cycle despite a stray season", () => {
    const r = inferRotation([W, F, W, F, W, F, W, F, W, F, S, F]);
    expect(r).toMatchObject({ kind: "fallow_rotation", period: 2, pattern: [W, F] });
    expect(r.agreement).toBeGreaterThanOrEqual(0.8);
  });

  it("calls a single repeated label continuous", () => {
    expect(inferRotation([W, W, W, W, W, W])).toMatchObject({
      kind: "continuous",
      period: 1,
      pattern: [W],
    });
  });

  it("finds a three-season crop rotation without fallow", () => {
    expect(inferRotation([W, S, W, W, S, W, W, S, W])).toMatchObject({
      kind: "crop_rotation",
      period: 3,
    });
  });

  it("keeps uncertain seasons as placeholders that do not vote", () => {
    expect(inferRotation([W, F, U, F, W, F, W, U]).pattern).toEqual([W, F]);
  });

  it("is irregular without enough seasons or agreement", () => {
    expect(inferRotation([])).toMatchObject({
      kind: "irregular",
      period: null,
      pattern: [],
      agreement: 0,
    });
    expect(inferRotation([W, F, S])).toMatchObject({ kind: "irregular" });
    const r = inferRotation([W, S, F, F, W, W, S, F, S, W]);
    expect(r.kind).toBe("irregular");
    expect(r.agreement).toBeGreaterThan(0);
  });

  it("does not accept a cycle whose phase never got a vote", () => {
    expect(inferRotation([W, U, W, U, W, U]).kind).toBe("continuous");
  });
});

describe("cropId", () => {
  it("maps classes to pack ids, keeps fallow and unmapped classes", () => {
    expect(cropId(W, { winter_crop: "barley" })).toBe("barley");
    expect(cropId(F, { winter_crop: "barley" })).toBe("fallow");
    expect(cropId(S)).toBe("summer_crop");
    expect(cropId(U, { winter_crop: "barley" })).toBe("uncertain");
    expect(inferRotation([W, F, W, F], { winter_crop: "barley" }).crops).toEqual([
      "barley",
      "fallow",
    ]);
  });
});
