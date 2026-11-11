import { type CropEntry, loadPack } from "@itza/knowledge";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Constraints } from "../../src/contracts";
import { validate } from "../../src/contracts";
import {
  type ClimateFacts,
  climateHit,
  constraintHit,
  EQUIPMENT_LIMITS,
  enumerateSequences,
  explainExclusion,
  frostFreeDays,
  generateCandidates,
  isForageOnly,
  pestBreakViolations,
  seasonMeanTemperature,
  unknownEquipmentLimits,
} from "../../src/decisions";
import { createReplayWorld } from "../../src/replay";
import { loadBundle, packCrop } from "../physics/helpers";
import { makeBundle, makeInput, SOIL } from "../replay/helpers";

const dz = loadPack("dz-high-plains");
const crop = (id: string, pack = dz) => pack.crops.find((c) => c.id === id) as CropEntry;
const base: Constraints = { irrigation: { level: "none" }, livestock: true };

/** Test-side oracle: unroll the repeating cycle and check every pair of plantings of a crop. */
function oracleRespectsBreaks(sequence: readonly CropEntry[], pack = dz): boolean {
  const n = sequence.length;
  const unrolled = [...sequence, ...sequence, ...sequence];
  for (const c of new Set(sequence)) {
    const need = Math.max(
      0,
      ...pack.pests
        .filter(
          (p) =>
            p.hosts.crops.includes(c.id) ||
            (c.kind !== "fallow" && p.hosts.families.includes(c.family)),
        )
        .map((p) => p.min_break_years.value),
    );
    const at = unrolled.flatMap((x, i) => (x === c ? [i] : []));
    for (let k = 1; k < at.length; k++) {
      if (
        (at[k] as number) - (at[k - 1] as number) - 1 < need &&
        (at[k] as number) - (at[k - 1] as number) <= 2 * n
      )
        return false;
    }
  }
  return true;
}

describe("constraintHit", () => {
  it("excludes crops the farmer excluded or has no market for", () => {
    expect(constraintHit(crop("barley"), { ...base, excluded_crops: ["barley"] })).toMatchObject({
      filter: "excluded_by_user",
      reason: "You excluded Barley.",
    });
    expect(
      constraintHit(crop("lentil"), { ...base, market_access: { lentil: false } })?.filter,
    ).toBe("market_access");
    expect(constraintHit(crop("lentil"), { ...base, market_access: { lentil: true } })).toBeNull();
  });

  it("excludes irrigated crops without irrigation", () => {
    expect(constraintHit(crop("potato_irrigated"), base)?.filter).toBe("irrigation");
    expect(
      constraintHit(crop("potato_irrigated"), { ...base, irrigation: { level: "supplemental" } }),
    ).toBeNull();
    expect(constraintHit(crop("durum_wheat"), base)).toBeNull();
  });

  it("excludes forage-only crops without livestock", () => {
    const forage = crop("vetch_oat_forage");
    expect(
      isForageOnly(forage) || forage.forage_value.value < 0.5 || forage.market_flag.value,
    ).toBe(true);
    const hit = constraintHit(forage, { ...base, livestock: false });
    if (isForageOnly(forage)) expect(hit?.filter).toBe("livestock");
    expect(constraintHit(crop("fallow"), { ...base, livestock: false })).toBeNull();
  });

  it("applies known equipment limits and reports unknown ones", () => {
    const limits = { ...base, equipment_limits: ["no_row_crop_planter"] };
    expect(constraintHit(crop("spring_sunflower"), limits)?.filter).toBe("equipment");
    expect(constraintHit(crop("durum_wheat"), limits)).toBeNull();
    expect(Object.keys(EQUIPMENT_LIMITS)).toEqual(["no_row_crop_planter"]);
    expect(
      unknownEquipmentLimits({ ...base, equipment_limits: ["no_row_crop_planter", "no_drill"] }),
    ).toEqual(["no_drill"]);
    expect(unknownEquipmentLimits(base)).toEqual([]);
  });

  it("reports the first rule that applies", () => {
    expect(
      constraintHit(crop("potato_irrigated"), { ...base, excluded_crops: ["potato_irrigated"] })
        ?.filter,
    ).toBe("excluded_by_user");
  });
});

describe("climateHit", () => {
  const facts = (frostFree: number | null, mean?: [string, number | null][]): ClimateFacts => ({
    frostFreeDays: frostFree,
    seasonMeanC: new Map(mean ?? []),
  });

  it("excludes frost-tender crops whose season is longer than the frost-free stretch", () => {
    const sunflower = packCrop("dz-high-plains", "spring_sunflower");
    expect(climateHit(sunflower, facts(60))?.filter).toBe("frost_free_days");
    expect(climateHit(sunflower, facts(400))).toBeNull();
    expect(climateHit(sunflower, facts(null))).toBeNull();
  });

  it("never applies the frost-free rule to frost-hardy crops", () => {
    expect(climateHit(packCrop("dz-high-plains", "durum_wheat"), facts(30))).toBeNull();
  });

  it("excludes crops whose season is colder than their base or hotter than their limit", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    expect(
      climateHit(wheat, facts(null, [["durum_wheat", wheat.t_base_c.value - 1]]))?.reason,
    ).toMatch(/below its base/);
    expect(
      climateHit(wheat, facts(null, [["durum_wheat", wheat.t_max_c.value + 1]]))?.reason,
    ).toMatch(/above its upper limit/);
    expect(climateHit(wheat, facts(null, [["durum_wheat", 12]]))).toBeNull();
    expect(climateHit(wheat, facts(null, [["durum_wheat", null]]))).toBeNull();
  });

  it("ignores fallow", () => {
    expect(climateHit(crop("fallow"), facts(0))).toBeNull();
  });
});

describe("climate facts from the weather record", () => {
  const { ctx } = createReplayWorld({
    bundle: makeBundle(8),
    input: { soil: SOIL, scenario: { id: "history", kind: "history" } },
  });

  it("finds a frost-free stretch of a plausible length for full years", () => {
    const days = frostFreeDays(ctx, 36) as number;
    expect(days).toBeGreaterThan(100);
    expect(days).toBeLessThan(365);
    expect(frostFreeDays(ctx, -36)).not.toBeNull();
  });

  it("is null when no full year is in the record", () => {
    const { ctx: short } = createReplayWorld({
      bundle: loadBundle("fallow-heavy"),
      input: { soil: SOIL, scenario: { id: "history", kind: "history" } },
    });
    expect(frostFreeDays(short, 36)).not.toBeNull();
    const tiny = { ...short, forcing: { ...short.forcing, days: 100 } };
    expect(frostFreeDays(tiny, 36)).toBeNull();
  });

  it("averages the season temperature at default sowing", () => {
    const wheat = packCrop("dz-high-plains", "durum_wheat");
    const mean = seasonMeanTemperature(ctx, wheat) as number;
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(20);
  });
});

describe("pest breaks and enumeration", () => {
  it("rejects a crop that returns sooner than its strictest pest allows", () => {
    const wheat = crop("durum_wheat");
    expect(pestBreakViolations(dz.pests, [wheat])).not.toHaveLength(0);
    expect(pestBreakViolations(dz.pests, [wheat, crop("fallow")])).not.toHaveLength(0);
    expect(pestBreakViolations(dz.pests, [wheat, crop("fallow"), crop("cover_crop")])).toHaveLength(
      0,
    );
    expect(pestBreakViolations(dz.pests, [crop("fallow"), crop("cover_crop")])).toHaveLength(0);
  });

  it("names the crop, the pest and the break that was found", () => {
    const [v] = pestBreakViolations(dz.pests, [crop("durum_wheat")]);
    expect(v?.crop.id).toBe("durum_wheat");
    expect(v?.breakSeasons).toBe(0);
    expect(v?.pest.min_break_years.value).toBeGreaterThan(0);
  });

  it("enumerates each cycle once, within the length and structure rules, respecting breaks", () => {
    const sequences = enumerateSequences(dz.crops, dz.pests, 2, 5);
    expect(sequences.length).toBeGreaterThan(100);
    const keys = new Set<string>();
    for (const seq of sequences) {
      expect(seq.length).toBeGreaterThanOrEqual(2);
      expect(seq.length).toBeLessThanOrEqual(5);
      expect(oracleRespectsBreaks(seq)).toBe(true);
      expect(seq.some((c) => c.kind === "crop")).toBe(true);
      expect(seq.filter((c) => c.kind === "fallow").length).toBeLessThanOrEqual(1);
      expect(seq.filter((c) => c.kind === "cover").length).toBeLessThanOrEqual(1);
      for (const c of new Set(seq))
        expect(seq.filter((x) => x === c).length).toBeLessThanOrEqual(c.kind === "crop" ? 2 : 1);
      const ids = seq.map((c) => c.id);
      const cycle = ids
        .map((_, r) => ids.map((__, k) => ids[(r + k) % ids.length]).join("|"))
        .sort()[0] as string;
      expect(keys.has(cycle)).toBe(false);
      keys.add(cycle);
      // Not a repetition of a shorter cycle.
      for (let period = 1; period < ids.length; period++) {
        if (ids.length % period === 0) {
          expect(ids.every((id, i) => id === ids[i % period])).toBe(false);
        }
      }
    }
  });

  it("finds sequences for the proof-field pack, including wheat, millet and fallow", () => {
    const us = loadPack("us-central-great-plains");
    const sequences = enumerateSequences(us.crops, us.pests, 2, 5);
    const names = sequences.map((s) => s.map((c) => c.id).join(","));
    expect(sequences.length).toBeGreaterThan(50);
    expect(
      names.some(
        (n) =>
          ["winter_wheat", "proso_millet", "fallow"].every((id) => n.includes(id)) &&
          n.split(",").length === 3,
      ),
    ).toBe(true);
  });

  it("returns nothing for too short an allowed list or inverted lengths", () => {
    expect(enumerateSequences([crop("fallow")], dz.pests, 2, 5)).toEqual([]);
    expect(enumerateSequences(dz.crops, dz.pests, 5, 2)).toEqual([]);
  });
});

describe("generateCandidates", () => {
  for (const name of ["semi-arid-winter-cereal", "fallow-heavy"] as const) {
    it(`finds at least two feasible alternatives with the baseline first: ${name}`, () => {
      const bundle = loadBundle(name);
      const input = makeInput({ constraints: base });
      const result = generateCandidates({ bundle, input });
      const [first, ...alternatives] = result.candidates;
      expect(first?.isBaseline).toBe(true);
      expect(first?.rotation.id).toBe("wheat_continuous");
      expect(first?.violations.length).toBeGreaterThan(0);
      expect(alternatives.length).toBeGreaterThanOrEqual(2);
      expect(alternatives.length).toBeLessThanOrEqual(6);
      for (const c of alternatives) {
        expect(c.violations).toEqual([]);
        expect(c.isBaseline).toBe(false);
        expect(c.score).toBeGreaterThan(0);
        expect(c.score).toBeLessThanOrEqual(1);
      }
      alternatives.forEach((c, i) => {
        if (i > 0) expect(c.rank).toBeGreaterThan(alternatives[i - 1]?.rank as number);
      });
      expect(result.considered).toBeGreaterThan(0);
    });
  }

  it("produces rotations that are valid engine input", () => {
    const result = generateCandidates({
      bundle: loadBundle("semi-arid-winter-cereal"),
      input: makeInput({ constraints: base }),
    });
    const rotations = result.candidates.map((c) => c.rotation) as never;
    const check = validate("engine-input", makeInput({ rotations, constraints: base }));
    expect(check.ok).toBe(true);
    expect(new Set(result.candidates.map((c) => c.rotation.id)).size).toBe(
      result.candidates.length,
    );
  });

  it("keeps the family compositions varied when it can", () => {
    const result = generateCandidates(
      {
        bundle: makeBundle(25),
        input: makeInput({
          rotations: undefined as never,
          baseline: { id: "wheat_fallow", seasons: [{ crop: "winter_wheat" }, { crop: "fallow" }] },
          constraints: base,
        }),
        packId: "us-central-great-plains",
      },
      { topN: 4 },
    );
    const alternatives = result.candidates.filter((c) => !c.isBaseline);
    expect(alternatives).toHaveLength(4);
    expect(new Set(alternatives.map((c) => c.families.join("+"))).size).toBe(4);
  });

  it("works without a baseline and respects topN", () => {
    const input = makeInput({ constraints: base });
    delete (input as { baseline?: unknown }).baseline;
    const result = generateCandidates({ bundle: loadBundle("fallow-heavy"), input }, { topN: 2 });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.every((c) => !c.isBaseline)).toBe(true);
  });

  it("never repeats the baseline's own cycle as an alternative", () => {
    const input = makeInput({
      baseline: {
        id: "mine",
        seasons: [{ crop: "durum_wheat" }, { crop: "fallow" }, { crop: "cover_crop" }],
      },
      constraints: base,
    });
    const result = generateCandidates({ bundle: loadBundle("fallow-heavy"), input });
    const ids = (c: { rotation: { seasons: { crop: string }[] } }) =>
      c.rotation.seasons
        .map((s) => s.crop)
        .sort()
        .join();
    const mine = ids(result.candidates[0] as never);
    expect(result.candidates.slice(1).some((c) => ids(c) === mine)).toBe(false);
  });

  it("limits how many sequences it replays", () => {
    const result = generateCandidates(
      { bundle: loadBundle("fallow-heavy"), input: makeInput({ constraints: base }) },
      { maxScored: 3 },
    );
    expect(result.considered).toBeLessThanOrEqual(3);
  });

  it("lists equipment limits it cannot apply as gaps", () => {
    const result = generateCandidates({
      bundle: loadBundle("fallow-heavy"),
      input: makeInput({
        constraints: { ...base, equipment_limits: ["no_row_crop_planter", "no_drill"] },
      }),
    });
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatch(/no_drill/);
  });

  it("never lets an alternative break a hard constraint, whatever the constraints", {
    timeout: 60_000,
  }, () => {
    const cropIds = dz.crops.map((c) => c.id);
    const constraints = fc.record({
      irrigation: fc.constantFrom("none", "supplemental", "full").map((level) => ({ level })),
      livestock: fc.boolean(),
      excluded_crops: fc.subarray(cropIds, { maxLength: 5 }),
      market_access: fc.dictionary(fc.constantFrom(...cropIds), fc.boolean(), { maxKeys: 4 }),
      equipment_limits: fc.constantFrom([], ["no_row_crop_planter"]),
    });
    const bundle = loadBundle("semi-arid-winter-cereal");
    fc.assert(
      fc.property(constraints, (c) => {
        const result = generateCandidates({
          bundle,
          input: makeInput({ constraints: c as Constraints }),
        });
        for (const candidate of result.candidates.filter((x) => !x.isBaseline)) {
          const entries = candidate.rotation.seasons.map((s) => crop(s.crop));
          expect(entries.length).toBeGreaterThanOrEqual(2);
          expect(entries.length).toBeLessThanOrEqual(5);
          expect(oracleRespectsBreaks(entries)).toBe(true);
          for (const e of entries) {
            expect(c.excluded_crops).not.toContain(e.id);
            expect(c.market_access?.[e.id]).not.toBe(false);
            if (e.kind === "crop" && e.requires_irrigation)
              expect(c.irrigation.level).not.toBe("none");
            if (!c.livestock)
              expect(e.kind === "crop" && !e.market_flag.value && e.forage_value.value >= 0.5).toBe(
                false,
              );
            if (c.equipment_limits.includes("no_row_crop_planter"))
              expect(e.id).not.toMatch(/sunflower|maize|corn|sorghum|potato/);
          }
        }
      }),
      { numRuns: 25 },
    );
  });
});

describe("explainExclusion", () => {
  const input = makeInput({
    constraints: {
      irrigation: { level: "none" },
      livestock: true,
      excluded_crops: ["rapeseed"],
      equipment_limits: ["no_row_crop_planter"],
    },
  });
  const result = generateCandidates({ bundle: loadBundle("semi-arid-winter-cereal"), input });

  it("names the filter that removed a crop", () => {
    expect(explainExclusion(result, "rapeseed")).toEqual({
      crop: "rapeseed",
      excluded: true,
      reason: "You excluded Rapeseed.",
    });
    expect(explainExclusion(result, "spring_sunflower").reason).toMatch(/no row-crop planter/);
    expect(explainExclusion(result, "potato_irrigated").reason).toMatch(/needs irrigation/);
  });

  it("explains a crop that no allowed rotation can fit, by its pest break", () => {
    const lentil = explainExclusion(result, "lentil");
    expect(lentil.excluded).toBe(true);
    expect(lentil.reason).toMatch(/Broomrape/);
    expect(lentil.reason).toMatch(/5 seasons/);
  });

  it("says where an included crop appears", () => {
    const included = result.candidates.flatMap((c) =>
      c.rotation.seasons.map((s) => s.crop),
    )[0] as string;
    const explained = explainExclusion(result, included);
    expect(explained.excluded).toBe(false);
    expect(explained.reason).toMatch(/is in /);
  });

  it("explains a crop that is allowed but did not make the top rotations", () => {
    const left = result.exclusions.find((e) => e.filter === "not_selected");
    if (left) {
      expect(explainExclusion(result, left.crop)).toMatchObject({ excluded: true });
      expect(left.reason).toMatch(/ranks \d+ of \d+/);
    }
  });

  it("answers for unknown crops and has a reason for every other crop", () => {
    expect(explainExclusion(result, "banana")).toMatchObject({ excluded: true });
    for (const id of Object.keys(result.names)) {
      const e = explainExclusion(result, id);
      expect(e.reason.length).toBeGreaterThan(5);
    }
  });
});
