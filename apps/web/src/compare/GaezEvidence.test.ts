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
    expect(html).toContain("Chickpea: GAEZ rates this crop marginal");
    expect(html).toContain("Risk needing local review");
    expect(html).toContain("Low confidence: a single grid cell");
    expect(html).toContain("do not change scores or remove crops");
    expect(html).toContain("FAO / IIASA · GAEZ v5");
    expect(html).toContain("30 arc-seconds (about 1 km)");
    expect(html).toContain("2001-2020");
    expect(html.match(/Chickpea: GAEZ/g)).toHaveLength(1);
    expect(html).not.toMatch(/\{(?:crop|rating|seconds|version)\}/);
  });

  it("shows a mapping gap and never calls it not suitable", () => {
    const html = render(["lentil"]);
    expect(html).toContain("Lentil: GAEZ suitability is not available");
    expect(html).not.toContain("rates this crop");
    expect(html).not.toContain("not suitable");
  });

  it("does not show a local rating for another field in the same knowledge region", () => {
    const html = render(["chickpea"], [5.41, 36.19]);
    expect(html).toContain("no GAEZ rating has been sampled for this field");
    expect(html).not.toContain("rates this crop marginal");
    expect(html).not.toContain("Risk needing local review");
  });

  it("has no section for a crop or pack without GAEZ entries", () => {
    expect(render([])).toBe("");
    expect(render(["winter_wheat"], [-103.17, 40.16], "us-central-great-plains")).toBe("");
  });
});
