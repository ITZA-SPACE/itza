import type { FieldBundle } from "@itza/engine/contracts";
import { describe, expect, it } from "vitest";
import { period } from "./useTwinData";

const bundleWith = (start: string, days: number) =>
  ({
    series: [{ var: "ndvi", start, cadence: "daily", values: new Array(days).fill(0.4) }],
  }) as unknown as FieldBundle;

describe("zones period", () => {
  it("keeps a record of five years or less whole", () => {
    expect(period(bundleWith("2021-01-01", 365))).toEqual({
      start: "2021-01-01",
      end: "2021-12-31",
    });
  });

  it("uses the latest 1825 days of a longer record, the most /v1/zones accepts", () => {
    const { start, end } = period(bundleWith("2001-01-01", 9131));
    expect(end).toBe("2025-12-31");
    expect(start).toBe("2021-01-02");
    expect((Date.parse(end) - Date.parse(start)) / 86_400_000 + 1).toBe(1825);
  });
});
