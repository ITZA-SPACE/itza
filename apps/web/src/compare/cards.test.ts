import { describe, expect, it } from "vitest";
import { groupGaps } from "./cards";

describe("groupGaps", () => {
  it("folds gaps that differ only by date into one line", () => {
    const out = groupGaps([
      "Greenness: no valid frame pixels on 2024-03-08.",
      "Soil: Mapped soil is not a farmer soil test.",
      "Greenness: no valid frame pixels on 2024-01-06.",
      "Greenness: no valid frame pixels on 2025-12-31.",
    ]);
    expect(out).toEqual([
      "Greenness: no valid frame pixels on 3 dates, 2024-01-06 to 2025-12-31.",
      "Soil: Mapped soil is not a farmer soil test.",
    ]);
  });

  it("keeps a single dated gap as it was", () => {
    expect(groupGaps(["Greenness: no clear scene on 2024-08-28"])).toEqual([
      "Greenness: no clear scene on 2024-08-28.",
    ]);
  });
});
