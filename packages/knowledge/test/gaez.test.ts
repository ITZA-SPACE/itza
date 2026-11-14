import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack } from "../src/index";
import { validatePack } from "../src/validate";

// biome-ignore lint/suspicious/noExplicitAny: validator tests deliberately mutate valid input
const copy = (): any => structuredClone(loadPack("dz-high-plains"));
const firstEvidence = (pack: ReturnType<typeof copy>) => pack.crops[0].gaez_suitability;

describe("GAEZ story evidence", () => {
  it("covers every story entry with a sourced class or an explained gap", () => {
    const pack = loadPack("dz-high-plains");
    expect(pack.version).toBe("1.1.0");
    for (const crop of pack.crops) {
      const evidence = crop.gaez_suitability;
      expect(evidence, crop.id).toBeDefined();
      if (!evidence) throw new Error(crop.id);
      expect(pack.sources[evidence.source]?.url).toContain("data.fao.org");
      expect(evidence).toMatchObject({
        version: "GAEZ v5",
        layer: "RES05-SIX30AS",
        water_supply: "rainfed",
        input_level: "low",
        climate: "AgERA5",
        period: "2001-2020",
        resolution_arc_seconds: 30,
        usage: "evidence_only",
        confidence: "low",
      });
      expect(evidence.note.length).toBeGreaterThan(30);
      if (evidence.status === "not_available") expect(evidence.value).toBeNull();
    }
    expect(
      pack.crops.filter((c) => c.gaez_suitability?.status === "not_available").map((c) => c.id),
    ).toEqual(["lentil", "faba_bean", "vetch_oat_forage", "cover_crop", "fallow"]);
  });

  it("matches the captured native-grid raster samples without network calls", () => {
    const fixture = JSON.parse(
      readFileSync(new URL("./fixtures/gaez-setif.json", import.meta.url), "utf8"),
    ) as {
      longitude: number;
      latitude: number;
      samples: { crop: string; value: number; url: string }[];
    };
    const available = loadPack("dz-high-plains").crops.flatMap((c) =>
      c.gaez_suitability?.status === "available" ? [c.gaez_suitability] : [],
    );
    expect(available).toHaveLength(9);
    for (const evidence of available) {
      const sample = fixture.samples.find((s) => s.crop === evidence.gaez_crop);
      expect(sample).toBeDefined();
      expect(evidence.value).toBe(sample?.value);
      expect(evidence.raster_url).toBe(sample?.url);
      expect(evidence.location).toMatchObject({
        longitude: fixture.longitude,
        latitude: fixture.latitude,
      });
    }
    const crops = loadPack("dz-high-plains").crops;
    expect(crops.find((c) => c.id === "durum_wheat")?.gaez_suitability?.note).toContain(
      "generic wheat",
    );
    expect(crops.find((c) => c.id === "potato_irrigated")?.gaez_suitability?.note).toContain(
      "does not rate the irrigated option",
    );
  });

  // Exhaust the small finite class domain rather than adding a generator dependency.
  it.each([1, 2, 3, 4, 5, 6, 7, 8])("accepts suitability class %s", (value) => {
    const pack = copy();
    firstEvidence(pack).value = value;
    expect(validatePack(pack)).toEqual([]);
  });

  it.each([0, 9, -9, 1.5, "6"])("rejects nodata, water and invalid class %s", (value) => {
    const pack = copy();
    firstEvidence(pack).value = value;
    expect(validatePack(pack).length).toBeGreaterThan(0);
  });

  it.each([
    "source",
    "confidence",
    "version",
    "layer",
    "water_supply",
    "input_level",
    "climate",
    "period",
    "resolution_arc_seconds",
    "location",
    "accessed",
    "note",
    "usage",
  ])("rejects missing provenance or usage field %s", (key) => {
    const pack = copy();
    delete firstEvidence(pack)[key];
    expect(validatePack(pack).length).toBeGreaterThan(0);
  });

  it("requires every story entry, including fallow, to declare its availability", () => {
    for (let i = 0; i < loadPack("dz-high-plains").crops.length; i++) {
      const pack = copy();
      delete pack.crops[i].gaez_suitability;
      expect(validatePack(pack).join("\n")).toContain("story crops need GAEZ");
    }
  });

  it.each(["value", "gaez_crop", "raster_url"])("rejects available evidence missing %s", (key) => {
    const pack = copy();
    if (key === "value") firstEvidence(pack).value = null;
    else delete firstEvidence(pack)[key];
    expect(validatePack(pack).join("\n")).toContain("available GAEZ evidence needs");
  });

  it.each(["value", "gaez_crop", "raster_url"])(
    "rejects unavailable evidence claiming %s",
    (key) => {
      const pack = copy();
      const evidence = pack.crops.find((c: { id: string }) => c.id === "lentil").gaez_suitability;
      evidence[key] = firstEvidence(pack)[key];
      expect(validatePack(pack).join("\n")).toContain("not_available GAEZ evidence needs");
    },
  );

  it("rejects a class for fallow and an unresolved citation", () => {
    const pack = copy();
    pack.crops.find((c: { id: string }) => c.id === "fallow").gaez_suitability = {
      ...firstEvidence(pack),
    };
    firstEvidence(pack).source = "unknown_gaez";
    const errors = validatePack(pack).join("\n");
    expect(errors).toContain("fallow cannot have a GAEZ crop class");
    expect(errors).toContain('unknown source "unknown_gaez"');
  });

  it.each([
    ["usage", "filter"],
    ["water_supply", "irrigated"],
    ["input_level", "intermediate"],
    ["version", "GAEZ v4"],
    ["accessed", "yesterday"],
    ["note", ""],
    ["raster_url", "not-a-url"],
  ])("rejects unsupported metadata %s=%s", (key, value) => {
    const pack = copy();
    firstEvidence(pack)[key] = value;
    expect(validatePack(pack).length).toBeGreaterThan(0);
  });
});
