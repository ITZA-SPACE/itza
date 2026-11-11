import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  EngineInput,
  EngineOutput,
  EvidenceCard,
  FieldBundle,
  Rotation,
} from "../../src/contracts";
import { validate } from "../../src/contracts";
import {
  buildEvidenceCard,
  buildEvidenceCards,
  confidenceFor,
  evidenceSentence,
  type GroundTruth,
  generateCandidates,
} from "../../src/decisions";
import { createReplayWorld, planOf, scoreReplay, simulateReplay } from "../../src/replay";
import { loadBundle } from "../physics/helpers";
import { makeBundle, makeInput, PRIORITIES } from "../replay/helpers";

const sum = (o: object) => Object.values(o as Record<string, number>).reduce((a, b) => a + b, 0);

/** Candidates, their replay and their cards for one bundle. */
function cardsFor(
  bundle: FieldBundle,
  overrides: Partial<EngineInput> = {},
  extra: { groundTruth?: GroundTruth; arena?: string[] } = {},
) {
  const base = makeInput({ monte_carlo_draws: 10, ...overrides });
  const found = generateCandidates({ bundle, input: base });
  const rotations = found.candidates.map((c) => c.rotation);
  const input = {
    ...base,
    rotations: rotations.filter((r) => r.id !== base.baseline?.id) as EngineInput["rotations"],
  };
  const output = scoreReplay(simulateReplay({ bundle, input }), input.priorities);
  const cards = buildEvidenceCards({
    bundle,
    input,
    output,
    rotations,
    ...(extra.groundTruth ? { groundTruth: extra.groundTruth } : {}),
    ...(extra.arena ? { arenaDisagreements: extra.arena } : {}),
  });
  return { cards, input, output, rotations };
}

describe("evidence cards", () => {
  for (const name of ["semi-arid-winter-cereal", "fallow-heavy"] as const) {
    it(`are valid against the schema and complete: ${name}`, () => {
      const { cards, output } = cardsFor(loadBundle(name));
      expect(cards.length).toBeGreaterThanOrEqual(3);
      expect(cards.map((c) => c.rotation_id)).toEqual(output.results.map((r) => r.rotation_id));
      expect(cards.filter((c) => c.is_baseline)).toHaveLength(1);
      for (const card of cards) {
        expect(validate("evidence-card", card).ok).toBe(true);
        expect(sum(card.contributions)).toBeCloseTo(card.score, 9);
        expect(card.benefits.length).toBeGreaterThanOrEqual(1);
        expect(card.benefits.length).toBeLessThanOrEqual(5);
        expect(card.confidence.reasons).toHaveLength(5);
        for (const e of card.evidence) {
          for (const field of [e.indicator, e.comparison, e.source, e.resolution, e.period]) {
            expect(field.length).toBeGreaterThan(0);
            expect(field.length).toBeLessThanOrEqual(400);
          }
        }
        for (const text of [
          card.why,
          card.resilience_headline,
          ...card.benefits,
          ...card.gaps,
          ...card.risks,
        ]) {
          expect(text.length).toBeGreaterThan(0);
          expect(text.length).toBeLessThanOrEqual(400);
        }
      }
    });
  }

  it("keeps cards valid and contributions summing to the score for any priorities", () => {
    const { input, rotations, cards: first } = cardsFor(loadBundle("semi-arid-winter-cereal"));
    const bundle = loadBundle("semi-arid-winter-cereal");
    const run = simulateReplay({ bundle, input });
    expect(first.length).toBeGreaterThan(0);
    const priority = fc.integer({ min: 0, max: 5 });
    fc.assert(
      fc.property(
        fc.record({
          water: priority,
          soil_health: priority,
          nitrogen: priority,
          erosion: priority,
          forage: priority,
          income: priority,
          pest_break: priority,
        }),
        (p) => {
          const cards = buildEvidenceCards({
            bundle,
            input: { ...input, priorities: p },
            output: scoreReplay(run, p),
            rotations,
          });
          for (const card of cards) {
            expect(validate("evidence-card", card).ok).toBe(true);
            expect(sum(card.contributions)).toBeCloseTo(card.score, 9);
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it("describes the baseline as the current rotation and compares others with it", () => {
    const { cards } = cardsFor(loadBundle("semi-arid-winter-cereal"));
    const baseline = cards.find((c) => c.is_baseline) as EvidenceCard;
    const other = cards.find((c) => !c.is_baseline) as EvidenceCard;
    expect(baseline.why).toMatch(/This is your current rotation/);
    expect(baseline.evidence[0]?.comparison).toBe("this is your current rotation");
    expect(baseline.resilience_headline).not.toMatch(/against/);
    expect(other.why).toMatch(/your current rotation/);
    expect(other.evidence[0]?.comparison).toMatch(/for your current rotation/);
    expect(other.resilience_headline).toMatch(/against \d+ of \d+ for your current rotation/);
    expect(other.evidence.some((e) => e.indicator.startsWith("Seasons that beat"))).toBe(true);
    expect(baseline.evidence.some((e) => e.indicator.startsWith("Seasons that beat"))).toBe(false);
  });

  it("explains without a baseline", () => {
    const input = makeInput({ monte_carlo_draws: 0 });
    delete (input as { baseline?: unknown }).baseline;
    const bundle = loadBundle("fallow-heavy");
    const output = scoreReplay(simulateReplay({ bundle, input }), input.priorities);
    const cards = buildEvidenceCards({ bundle, input, output });
    expect(cards.every((c) => !c.is_baseline)).toBe(true);
    expect(cards[0]?.why).toMatch(/^Scores \d\.\d\d in the replay/);
    expect(cards[0]?.evidence[0]?.comparison).toBe("no current rotation to compare with");
    expect(validate("evidence-card", cards[0]).ok).toBe(true);
  });

  it("lists information gaps: bundle gaps, scale mismatch, estimated traits, no soil test, no satellite", () => {
    const withoutTest = loadBundle("semi-arid-winter-cereal");
    const { cards } = cardsFor(withoutTest, {
      soil: { awc_mm_per_m: { value: 140, source: "soilgrids", confidence: "medium" } },
    });
    const gaps = (cards[0] as EvidenceCard).gaps.join("\n");
    expect(gaps).toMatch(/SMAP cell is much larger/);
    expect(gaps).toMatch(/55 km across, much larger than your 12\.4 ha field/);
    expect(gaps).toMatch(/team estimates still waiting for local expert review/);
    expect(gaps).toMatch(/No soil test: soil water capacity comes from soilgrids/);
    const tested = cardsFor(withoutTest).cards[0] as EvidenceCard;
    expect(tested.gaps.join("\n")).not.toMatch(/No soil test/);
  });

  it("reports a missing satellite series and seasons that could not be replayed", () => {
    const bundle = makeBundle(4);
    const input = makeInput({
      monte_carlo_draws: 0,
      rotations: [{ id: "late", seasons: [{ crop: "durum_wheat", sowing_doy: 90 }] }],
      baseline: undefined as never,
    });
    delete (input as { baseline?: unknown }).baseline;
    const output = scoreReplay(simulateReplay({ bundle, input }), input.priorities);
    const [card] = buildEvidenceCards({ bundle, input, output });
    const gaps = (card as EvidenceCard).gaps.join("\n");
    expect(gaps).toMatch(/No satellite soil moisture/);
    expect(gaps).toMatch(/only 3 of 4 usable seasons/);
  });

  it("flags rules for local review: pest breaks, frost, market, heavy soil, and Model Arena disagreements", () => {
    const bundle = makeBundle(12);
    const input = makeInput({
      monte_carlo_draws: 0,
      soil: {
        clay_pct: { value: 55, source: "user_soil_test", confidence: "high" },
        sand_pct: { value: 10, source: "user_soil_test", confidence: "high" },
      },
      rotations: [
        { id: "cereal", seasons: [{ crop: "durum_wheat" }] },
        { id: "forage", seasons: [{ crop: "vetch_oat_forage" }, { crop: "fallow" }] },
        { id: "pulse", seasons: [{ crop: "durum_wheat" }, { crop: "lentil" }, { crop: "fallow" }] },
      ],
    });
    const output = scoreReplay(simulateReplay({ bundle, input }), input.priorities);
    const cards = buildEvidenceCards({
      bundle,
      input,
      output,
      arenaDisagreements: [
        "The machine-learning model expects a worse dry year than the rule engine.",
      ],
    });
    const risks = (id: string) =>
      (cards.find((c) => c.rotation_id === id) as EvidenceCard).risks.join("\n");
    expect(risks("cereal")).toMatch(/Durum wheat returns after 0 seasons away/);
    expect(risks("cereal")).toMatch(/Frost or heat damaged \d+ of 12 replayed seasons/);
    expect(risks("pulse")).toMatch(/Heavy soil with slow drainage: Lentil/);
    expect(risks("pulse")).toMatch(/Lentil returns after 2 seasons away/);
    expect(risks("forage")).toMatch(/No market is flagged for Vetch-oat forage|returns after/);
    for (const card of cards) {
      expect(card.risks).toContain(
        "The machine-learning model expects a worse dry year than the rule engine.",
      );
      expect(validate("evidence-card", card).ok).toBe(true);
    }
  });

  it("clips any sentence to the schema's 400 characters", () => {
    const { cards, input, output, rotations } = cardsFor(loadBundle("fallow-heavy"));
    const long = "x".repeat(900);
    const clipped = buildEvidenceCards({
      bundle: loadBundle("fallow-heavy"),
      input,
      output,
      rotations,
      arenaDisagreements: [long],
    });
    const risk = (clipped[0] as EvidenceCard).risks.find((r) => r.startsWith("xxx")) as string;
    expect(risk).toHaveLength(400);
    expect(risk.endsWith("…")).toBe(true);
    expect(validate("evidence-card", clipped[0]).ok).toBe(true);
    expect(cards.length).toBe(clipped.length);
  });

  it("takes confidence from the same factors as confidenceFor, and ground truth raises it", () => {
    const bundle = loadBundle("semi-arid-winter-cereal");
    const plain = cardsFor(bundle, {
      soil: { awc_mm_per_m: { value: 140, source: "soilgrids", confidence: "medium" } },
    });
    const observed = cardsFor(
      bundle,
      { soil: { awc_mm_per_m: { value: 140, source: "soilgrids", confidence: "medium" } } },
      { groundTruth: { plantingDates: 4, yields: 4 } },
    );
    const order = ["low", "medium", "high"];
    const level = (cards: EvidenceCard[]) =>
      order.indexOf((cards[0] as EvidenceCard).confidence.level);
    expect(level(observed.cards)).toBeGreaterThanOrEqual(level(plain.cards));
    expect((observed.cards[0] as EvidenceCard).confidence.reasons[4]).toMatch(/planting dates/);
    const world = createReplayWorld({ bundle, input: plain.input });
    const crops = planOf(world.pack, plain.rotations[0] as Rotation).seasons.map((s) => s.entry);
    const direct = confidenceFor({ bundle, input: plain.input, world, crops, agreement: null });
    expect(direct.reasons).toHaveLength(5);
  });

  it("refuses a result whose rotation it cannot find", () => {
    const { input, output } = cardsFor(loadBundle("fallow-heavy"));
    expect(() =>
      buildEvidenceCards({ bundle: loadBundle("fallow-heavy"), input, output, rotations: [] }),
    ).toThrow(/No definition for rotation/);
  });

  it("builds a single card directly", () => {
    const bundle = loadBundle("fallow-heavy");
    const { input, output, rotations } = cardsFor(bundle);
    const world = createReplayWorld({ bundle, input });
    const result = output.results[0] as EngineOutput["results"][number];
    const rotation = rotations.find((r) => r.id === result.rotation_id) as Rotation;
    const crops = planOf(world.pack, rotation).seasons.map((s) => s.entry);
    const confidence = confidenceFor({ bundle, input, world, crops, agreement: null });
    const card = buildEvidenceCard({
      bundle,
      input,
      world,
      rotation,
      result,
      baseline: null,
      confidence,
    });
    expect(validate("evidence-card", card).ok).toBe(true);
    expect(card.confidence.level).toBe(confidence.level);
    expect(card.gaps.join("\n")).toMatch(/No satellite soil moisture/);
  });
});

describe("schema guard (F-08)", () => {
  const { cards } = cardsFor(loadBundle("semi-arid-winter-cereal"));
  const card = cards[0] as EvidenceCard;

  it("rejects a card missing any mandatory field", () => {
    for (const key of Object.keys(card) as (keyof EvidenceCard)[]) {
      const { [key]: _removed, ...rest } = card;
      expect(validate("evidence-card", rest).ok, `without ${key}`).toBe(false);
    }
  });

  it("rejects an evidence item without a source, or with an empty one", () => {
    const item = card.evidence[0] as EvidenceCard["evidence"][number];
    const { source: _source, ...noSource } = item;
    expect(validate("evidence-card", { ...card, evidence: [noSource] }).ok).toBe(false);
    expect(validate("evidence-card", { ...card, evidence: [{ ...item, source: "" }] }).ok).toBe(
      false,
    );
    expect(validate("evidence-card", { ...card, evidence: [] }).ok).toBe(false);
    expect(validate("evidence-card", { ...card, benefits: [] }).ok).toBe(false);
  });
});

describe("evidenceSentence", () => {
  it("renders an item as a plain-English sentence with its provenance", () => {
    expect(
      evidenceSentence({
        indicator: "Median season score",
        value: 0.73,
        comparison: "0.65 for your current rotation",
        source: "ITZA season replay on nasa_power_daily",
        resolution: "55 km weather cell",
        period: "2021-22 to 2023-24 (3 seasons)",
      }),
    ).toBe(
      "Median season score: 0.73 (0.65 for your current rotation). Source: ITZA season replay on nasa_power_daily, 55 km weather cell, 2021-22 to 2023-24 (3 seasons).",
    );
  });
});
