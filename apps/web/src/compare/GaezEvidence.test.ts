import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GaezEvidence } from "./GaezEvidence";

const render = (
  cropIds: string[],
  centroid: [number, number] = [5.7295, 36.11965],
  packId = "dz-high-plains",
) => renderToStaticMarkup(createElement(GaezEvidence, { packId, cropIds, centroid }));

describe("GAEZ card display", () => {
  it("shows the marginal rating, local-review risk, scale and baseline", () => {
    const html = render(["chickpea", "chickpea"]);
    expect(html).toContain("Chickpea: rated marginal");
    expect(html).toContain("Check with a local agronomist");
    expect(html).toContain("Low confidence: one grid cell");
    expect(html).toContain("never changes scores or crops");
    expect(html).toContain("FAO / IIASA · GAEZ v5");
    expect(html).toContain("30 arc-seconds (about 1 km)");
    expect(html).toContain("2001-2020");
    expect(html.match(/Chickpea: rated/g)).toHaveLength(1);
    expect(html).not.toMatch(/\{(?:crop|rating|seconds|version)\}/);
  });

  it("shows a mapping gap and never calls it not suitable", () => {
    const html = render(["lentil"]);
    expect(html).toContain("Lentil: no rating");
    expect(html).not.toContain("rated");
    expect(html).not.toContain("not suitable");
  });

  it("does not show a local rating for another field in the same knowledge region", () => {
    const html = render(["chickpea"], [5.41, 36.19]);
    expect(html).toContain("no rating sampled for this field");
    expect(html).not.toContain("rated marginal");
    expect(html).not.toContain("Check with a local agronomist");
  });

  it("has no section for a crop or pack without GAEZ entries", () => {
    expect(render([])).toBe("");
    expect(render(["winter_wheat"], [-103.17, 40.16], "us-central-great-plains")).toBe("");
  });
});
