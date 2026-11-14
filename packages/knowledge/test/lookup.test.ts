import { describe, expect, it } from "vitest";
import { listPacks, loadPack, packForLocation, UnknownPackError } from "../src/index";

describe("loadPack and listPacks", () => {
  it("loads a pack by region id", () => {
    const pack = loadPack("dz-high-plains");
    expect(pack.id).toBe("dz-high-plains");
    expect(pack.crops.length).toBeGreaterThan(10);
  });

  it("throws for an unknown id", () => {
    expect(() => loadPack("mars")).toThrow(UnknownPackError);
    expect(() => loadPack("mars")).toThrow("Unknown knowledge pack: mars");
  });

  it("returns frozen packs", () => {
    const pack = loadPack("generic");
    expect(Object.isFrozen(pack)).toBe(true);
    expect(Object.isFrozen(pack.crops[0])).toBe(true);
    expect(() => {
      (pack.crops as unknown[]).push({});
    }).toThrow();
  });

  it("lists summaries without the heavy data", () => {
    const list = listPacks();
    expect(list).toHaveLength(3);
    expect(list.find((p) => p.id === "generic")).toMatchObject({ generic: true, bbox: null });
    expect(list.find((p) => p.id === "dz-high-plains")).toMatchObject({
      generic: false,
      reviewStatus: "needs_expert_review",
    });
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      "bbox",
      "generic",
      "id",
      "name",
      "reviewStatus",
    ]);
  });

  it("keeps regional bounding boxes apart so a point has one pack", () => {
    const boxes = listPacks().flatMap((p) => (p.bbox ? [{ id: p.id, box: p.bbox }] : []));
    for (const a of boxes) {
      for (const b of boxes) {
        if (a.id === b.id) continue;
        const apart =
          a.box[2] < b.box[0] || b.box[2] < a.box[0] || a.box[3] < b.box[1] || b.box[3] < a.box[1];
        expect(apart, `${a.id} overlaps ${b.id}`).toBe(true);
      }
    }
  });
});

describe("packForLocation", () => {
  it("finds the story pack for Setif", () => {
    const hit = packForLocation(5.41, 36.19);
    expect(hit.pack.id).toBe("dz-high-plains");
    expect(hit.fallback).toBe(false);
  });

  it("finds the proof pack for Akron, Colorado", () => {
    const hit = packForLocation(-103.15, 40.15);
    expect(hit.pack.id).toBe("us-central-great-plains");
    expect(hit.fallback).toBe(false);
  });

  it("includes the edges of a region", () => {
    expect(packForLocation(-1.5, 34).pack.id).toBe("dz-high-plains");
    expect(packForLocation(-97, 43.5).pack.id).toBe("us-central-great-plains");
  });

  it("falls back to the labeled generic pack elsewhere", () => {
    for (const [lon, lat] of [
      [2.35, 48.85],
      [0, 0],
      [-103.15, 30],
      [151.2, -33.9],
    ] as const) {
      const hit = packForLocation(lon, lat);
      expect(hit.fallback).toBe(true);
      expect(hit.pack.id).toBe("generic");
      expect(hit.pack.generic).toBe(true);
    }
  });

  it("rejects coordinates that are not on Earth", () => {
    for (const [lon, lat] of [
      [181, 0],
      [0, 91],
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
    ] as const) {
      expect(() => packForLocation(lon, lat)).toThrow(RangeError);
    }
  });
});
