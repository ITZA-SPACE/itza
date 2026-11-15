import { describe, expect, it } from "vitest";
import { boxOf, morph, resample, startNear } from "./outlineTrace";

type Point = [number, number];

// An L-shaped field, counter-clockwise and closed, the way GeoJSON stores it.
const FIELD: Point[] = [
  [0, 0],
  [2, 0],
  [2, 1],
  [1, 1],
  [1, 2],
  [0, 2],
  [0, 0],
];

describe("outline trace", () => {
  it("spaces resampled points evenly along the closed ring", () => {
    const points = resample(boxOf(FIELD), 8);
    expect(points).toHaveLength(8);
    expect(points[0]).toEqual([0, 2]);
    expect(points[2]).toEqual([2, 2]);
    expect(points[4]).toEqual([2, 0]);
  });

  it("starts the field ring at the vertex nearest the target", () => {
    expect(startNear(FIELD, [0, 2])[0]).toEqual([0, 2]);
    expect(startNear(FIELD, [0, 2])).toHaveLength(6);
  });

  it("begins as the bounding box and ends on the field outline", () => {
    const frame = morph(FIELD);
    const box = frame(0);
    const field = frame(1);
    expect(box[0]).toEqual(box[box.length - 1]);
    expect(Math.min(...box.map((p) => p[0]))).toBe(0);
    expect(Math.max(...box.map((p) => p[1]))).toBe(2);
    // The box covers the empty corner of the L; the final ring never enters it.
    expect(box.some(([x, y]) => x > 1.5 && y > 1.5)).toBe(true);
    expect(field.some(([x, y]) => x > 1.01 && y > 1.01)).toBe(false);
    expect(field[0]).toEqual([0, 2]);
  });
});
