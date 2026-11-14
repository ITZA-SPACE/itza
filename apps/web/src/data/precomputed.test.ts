import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { precomputedStress } from "../arena/service";
import { parseGrace, parseScenes } from "../context/service";
import { parseZones } from "../zones/service";
import type { FieldGeometry } from "./geometry";
import { HERO_FIELDS } from "./hero";
import { heroStatic } from "./precomputed";

const bundles = resolve(import.meta.dirname, "../../public/bundles");
const story = HERO_FIELDS.find((h) => h.role === "story");
const elsewhere = {
  type: "Polygon",
  coordinates: [
    [
      [10, 10],
      [10.01, 10],
      [10.01, 10.01],
      [10, 10.01],
      [10, 10],
    ],
  ],
} as FieldGeometry;

/** Serves `public/bundles/<id>/<file>` and records every request, like the static host does. */
function serveBundles() {
  const requested: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const match = url.match(/bundles\/([^/]+)\/(.+)$/);
    try {
      const text = readFileSync(resolve(bundles, match?.[1] ?? "", match?.[2] ?? ""), "utf8");
      return new Response(text, { status: 200 });
    } catch {
      return new Response("", { status: 404 });
    }
  });
  return requested;
}

afterEach(() => vi.unstubAllGlobals());

describe("precomputed hero files", () => {
  it("reads a hero field's files and nothing for other fields", async () => {
    const requested = serveBundles();
    expect(await heroStatic(story?.geometry, "zones.json")).not.toBeNull();
    expect(await heroStatic(elsewhere, "zones.json")).toBeNull();
    expect(await heroStatic(undefined, "zones.json")).toBeNull();
    expect(requested).toHaveLength(1);
    expect(requested[0]).toContain(`bundles/${story?.id}/zones.json`);
  });

  it("returns null when the file cannot be fetched, so the API is asked instead", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    expect(await heroStatic(story?.geometry, "zones.json")).toBeNull();
  });

  it("parses the zones, the NISAR scenes and the GRACE series the app expects", async () => {
    serveBundles();
    const zones = parseZones(await heroStatic(story?.geometry, "zones.json"));
    expect(zones?.enabled).toBe(true);
    expect(zones?.features.length).toBeGreaterThan(0);
    const context = (await heroStatic(story?.geometry, "context.json")) as Record<string, unknown>;
    expect(parseScenes(context.nisar)).not.toBeNull();
    expect(parseScenes(context.ecostress)).not.toBeNull();
    expect(parseGrace(context.grace)).not.toBeNull();
  });

  it("gives the model's opinion for a season by its harvest year", async () => {
    serveBundles();
    const stress = await precomputedStress(story?.geometry, "2017-18");
    const ml = JSON.parse(readFileSync(resolve(bundles, story?.id ?? "", "ml.json"), "utf8"));
    const expected = ml.seasons.find((s: { season: string }) => s.season === "2018");
    expect(stress?.prediction).toBe(expected.prediction);
    expect(stress?.drivers.length).toBeGreaterThan(0);
    // The same season written as a calendar year is the same harvest year.
    expect((await precomputedStress(story?.geometry, "2018"))?.prediction).toBe(
      expected.prediction,
    );
  });

  it("has no opinion for a season outside the record or for another field", async () => {
    const requested = serveBundles();
    expect(await precomputedStress(story?.geometry, "1999-00")).toBeNull();
    expect(await precomputedStress(elsewhere, "2017-18")).toBeNull();
    expect(requested.filter((u) => u.includes("elsewhere"))).toHaveLength(0);
  });
});
