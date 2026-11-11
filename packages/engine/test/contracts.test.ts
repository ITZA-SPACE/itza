import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type SchemaId, validate } from "../src/contracts";

const synthetic = join(dirname(fileURLToPath(import.meta.url)), "../../../fixtures/synthetic");
const load = (file: string): unknown => JSON.parse(readFileSync(join(synthetic, file), "utf8"));
// biome-ignore lint/suspicious/noExplicitAny: tests mutate copies of valid documents
const clone = (file: string): any => structuredClone(load(file));

const BUNDLES = ["semi-arid-winter-cereal.bundle.json", "fallow-heavy.bundle.json"];
const EXAMPLES: SchemaId[] = [
  "provenance",
  "canonical-series",
  "engine-input",
  "engine-output",
  "evidence-card",
];

describe("examples and synthetic fixtures", () => {
  it.each(BUNDLES)("%s is a valid field bundle", (file) => {
    const result = validate("field-bundle", load(file));
    expect(result).toMatchObject({ ok: true });
  });

  it.each(EXAMPLES)("example %s validates against its schema", (id) => {
    expect(validate(id, load(`examples/${id}.json`))).toMatchObject({ ok: true });
  });

  it("every assistant tool example validates", () => {
    const calls = load("examples/assistant-tools.json") as unknown[];
    expect(calls).toHaveLength(10);
    for (const call of calls) expect(validate("assistant-tools", call)).toMatchObject({ ok: true });
  });

  it("returns typed data", () => {
    const result = validate("field-bundle", load(BUNDLES[0] as string));
    if (!result.ok) throw new Error("fixture should validate");
    expect(result.data.field.area_ha).toBeCloseTo(12.4);
    expect(result.data.series.map((s) => s.var)).toContain("precip");
  });

  it("keeps contributions equal to the composite score", () => {
    const sum = (values: Record<string, number>) =>
      Object.values(values).reduce((a, b) => a + b, 0);
    const card = clone("examples/evidence-card.json");
    expect(sum(card.contributions)).toBeCloseTo(card.score, 4);
    for (const rotation of clone("examples/engine-output.json").results) {
      expect(sum(rotation.contributions)).toBeCloseTo(rotation.score, 3);
      for (const season of rotation.seasons) {
        expect(sum(season.contributions)).toBeCloseTo(season.composite, 3);
      }
    }
  });
});

describe("rejections", () => {
  it("rejects a bundle whose series has no provenance", () => {
    const bundle = clone(BUNDLES[0] as string);
    delete bundle.series[3].provenance;
    const result = validate("field-bundle", bundle);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("provenance");
  });

  it("rejects provenance without a resolution or with an unknown quality", () => {
    const provenance = clone("examples/provenance.json");
    delete provenance.resolution_m;
    expect(validate("provenance", provenance).ok).toBe(false);
    expect(
      validate("provenance", { ...clone("examples/provenance.json"), quality: "great" }).ok,
    ).toBe(false);
  });

  it("rejects a series with an unknown variable", () => {
    const series = clone("examples/canonical-series.json");
    series.var = "rainfall";
    expect(validate("canonical-series", series).ok).toBe(false);
  });

  it.each([
    "why",
    "evidence",
    "benefits",
    "gaps",
    "risks",
    "score",
    "resilience_headline",
    "confidence",
    "contributions",
  ])("rejects an evidence card without %s", (field) => {
    const card = clone("examples/evidence-card.json");
    delete card[field];
    expect(validate("evidence-card", card).ok).toBe(false);
  });

  it.each(["indicator", "value", "comparison", "source", "resolution", "period"])(
    "rejects an evidence item without %s",
    (field) => {
      const card = clone("examples/evidence-card.json");
      delete card.evidence[0][field];
      expect(validate("evidence-card", card).ok).toBe(false);
    },
  );

  it("rejects an evidence card with empty evidence or an empty source", () => {
    const empty = clone("examples/evidence-card.json");
    empty.evidence = [];
    expect(validate("evidence-card", empty).ok).toBe(false);
    const blank = clone("examples/evidence-card.json");
    blank.evidence[0].source = "";
    expect(validate("evidence-card", blank).ok).toBe(false);
  });

  it("rejects engine input without a full set of priorities or with a weight out of range", () => {
    const missing = clone("examples/engine-input.json");
    delete missing.priorities.water;
    expect(validate("engine-input", missing).ok).toBe(false);
    const high = clone("examples/engine-input.json");
    high.priorities.water = 9;
    expect(validate("engine-input", high).ok).toBe(false);
  });

  it("rejects engine output with a score outside 0 and 1", () => {
    const output = clone("examples/engine-output.json");
    output.results[0].seasons[0].composite = 1.4;
    expect(validate("engine-output", output).ok).toBe(false);
  });

  it("rejects a tool call with the wrong input or an unknown tool", () => {
    const [first, , , season] = load("examples/assistant-tools.json") as { input: unknown }[];
    expect(validate("assistant-tools", { ...season, input: { year: 1900 } }).ok).toBe(false);
    expect(validate("assistant-tools", { tool: "delete_field", input: {}, output: {} }).ok).toBe(
      false,
    );
    expect(validate("assistant-tools", { ...first, input: { extra: 1 } }).ok).toBe(false);
  });

  it("throws on an unknown schema id", () => {
    expect(() => validate("nope" as SchemaId, {})).toThrow("Unknown schema id");
  });
});

describe("render_answer outputs from the SI gateway", () => {
  const call = (output: unknown) => ({
    tool: "render_answer",
    input: { messages: [{}] },
    output,
  });

  it.each([
    { status: "ok", droppedActions: 1 },
    { status: "error", code: "VALIDATION_FAILED", errors: ["x"], hint: "Fix it once." },
    { status: "fallback", code: "GROUNDING_FAILED", intent: "season_snapshot" },
  ])("accepts %o", (output) => {
    expect(validate("assistant-tools", call(output))).toMatchObject({ ok: true });
  });
});
