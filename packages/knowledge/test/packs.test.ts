import { describe, expect, it } from "vitest";
import { listPacks, loadPack } from "../src/index";
import { validatePack } from "../src/validate";

// biome-ignore lint/suspicious/noExplicitAny: tests mutate copies of valid packs
const copy = (id: string): any => structuredClone(loadPack(id));
const errors = (pack: unknown) => validatePack(pack).join("\n");

describe("shipped packs", () => {
  it.each(listPacks().map((p) => p.id))("%s validates", (id) => {
    expect(validatePack(loadPack(id))).toEqual([]);
  });

  it("ships the story, proof and generic packs", () => {
    expect(listPacks().map((p) => p.id)).toEqual([
      "dz-high-plains",
      "generic",
      "us-central-great-plains",
    ]);
  });

  it("has the story crops from the issue", () => {
    const ids = loadPack("dz-high-plains").crops.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "durum_wheat",
        "bread_wheat",
        "barley",
        "oats",
        "chickpea",
        "lentil",
        "faba_bean",
        "field_pea",
        "vetch_oat_forage",
        "rapeseed",
        "spring_sunflower",
        "potato_irrigated",
        "cover_crop",
        "fallow",
      ]),
    );
    expect(ids).toHaveLength(14);
  });

  it("covers every crop of the Akron long-term rotations in the proof pack", () => {
    const ids = loadPack("us-central-great-plains").crops.map((c) => c.id);
    for (const needed of [
      "winter_wheat",
      "proso_millet",
      "corn_dryland",
      "sunflower",
      "field_pea",
      "triticale",
      "fallow",
    ]) {
      expect(ids).toContain(needed);
    }
  });

  it("marks every pack as needing expert review and gives each source a citation", () => {
    for (const { id } of listPacks()) {
      const pack = loadPack(id);
      expect(pack.review.status).toBe("needs_expert_review");
      for (const source of Object.values(pack.sources))
        expect(source.citation.length).toBeGreaterThan(10);
    }
  });

  it("flags irrigation only for the irrigated potato", () => {
    const flagged = loadPack("dz-high-plains").crops.filter(
      (c) => c.kind !== "fallow" && c.requires_irrigation,
    );
    expect(flagged.map((c) => c.id)).toEqual(["potato_irrigated"]);
  });
});

describe("validation rejects bad packs", () => {
  it("rejects a value without a source", () => {
    const pack = copy("dz-high-plains");
    delete pack.crops[0].kc_ini.source;
    expect(errors(pack)).toContain("source");
  });

  it("rejects a value without confidence, and an unknown confidence", () => {
    const pack = copy("dz-high-plains");
    delete pack.crops[0].kc_mid.confidence;
    expect(errors(pack)).toContain("confidence");
    const other = copy("dz-high-plains");
    other.crops[0].kc_mid.confidence = "certain";
    expect(errors(other)).toContain("allowed values");
  });

  it("rejects a bare number where a sourced value is needed", () => {
    const pack = copy("dz-high-plains");
    pack.crops[0].depletion_fraction = 0.55;
    expect(errors(pack)).toContain("depletion_fraction");
  });

  it("rejects out-of-range values", () => {
    const pack = copy("dz-high-plains");
    pack.crops[0].depletion_fraction.value = 1.4;
    expect(errors(pack)).toContain("must be <= 0.8");
  });

  it("rejects a source id that the pack does not declare", () => {
    const pack = copy("dz-high-plains");
    pack.crops[0].kc_ini.source = "made_up";
    expect(errors(pack)).toContain('unknown source "made_up"');
  });

  it("rejects a declared source that nothing uses", () => {
    const pack = copy("dz-high-plains");
    pack.sources.unused = { citation: "Not cited anywhere in the pack." };
    expect(errors(pack)).toContain('source "unused" is never used');
  });

  it("rejects stage lengths that do not add up to the season length", () => {
    const pack = copy("dz-high-plains");
    pack.crops[0].season_length_days.value += 1;
    expect(errors(pack)).toContain("season_length_days must equal");
  });

  it("rejects unordered temperatures and root depths", () => {
    const pack = copy("dz-high-plains");
    pack.crops[0].t_base_c.value = 14;
    pack.crops[0].t_opt_c.value = 12;
    pack.crops[1].root_depth_max_m.value = 0.1;
    const text = errors(pack);
    expect(text).toContain("t_base_c < t_opt_c < t_max_c");
    expect(text).toContain("root_depth_ini_m must not exceed");
  });

  it("rejects duplicate ids", () => {
    const pack = copy("dz-high-plains");
    pack.crops[1].id = pack.crops[0].id;
    pack.pests[1].id = pack.pests[0].id;
    const text = errors(pack);
    expect(text).toContain("duplicate crop id");
    expect(text).toContain("duplicate pest id");
  });

  it("rejects pests with unknown or fallow hosts, or none", () => {
    const pack = copy("dz-high-plains");
    pack.pests[0].hosts.crops = ["ghost"];
    pack.pests[1].hosts.crops = ["fallow"];
    pack.pests[2].hosts = { families: [], crops: [] };
    const text = errors(pack);
    expect(text).toContain('unknown host crop "ghost"');
    expect(text).toContain("fallow cannot be a host");
    expect(text).toContain("no hosts");
  });

  it("needs exactly one fallow entry", () => {
    const pack = copy("dz-high-plains");
    pack.crops = pack.crops.filter((c: { id: string }) => c.id !== "fallow");
    pack.pests.forEach((p: { hosts: { crops: string[] } }) => {
      p.hosts.crops = p.hosts.crops.filter((c) => c !== "fallow");
    });
    expect(errors(pack)).toContain("need exactly one fallow entry");
  });

  it("checks bounding boxes", () => {
    const generic = copy("generic");
    generic.region.bbox = [0, 0, 1, 1];
    expect(errors(generic)).toContain("generic pack must have bbox null");

    const regional = copy("dz-high-plains");
    regional.region.bbox = null;
    expect(errors(regional)).toContain("needs a bbox");

    regional.region.bbox = [5, 0, 1, 10];
    expect(errors(regional)).toContain("bbox must be");
  });

  it("rejects unknown properties and wrong schema versions", () => {
    const pack = copy("dz-high-plains");
    pack.surprise = true;
    pack.schema = "knowledge-pack/2.0";
    expect(errors(pack)).toContain("must");
  });

  it("rejects a non-object", () => {
    expect(validatePack(null)).not.toEqual([]);
  });
});
