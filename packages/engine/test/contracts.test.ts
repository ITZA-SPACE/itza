import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { schemaNames, validate } from "../src/contracts";

const repo = join(__dirname, "../../..");
const read = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(repo, path), "utf8"));
const fixtures = readdirSync(join(repo, "fixtures/synthetic")).filter((f) => f.endsWith(".json"));

describe("schema examples", () => {
  for (const name of schemaNames) {
    it(`${name} validates its own examples`, () => {
      const examples = read(`schemas/${name}.schema.json`).examples as unknown[];
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(validate(name, example)).toMatchObject({ ok: true });
      }
    });
  }
});

describe("synthetic fixtures", () => {
  it("has two bundles", () => {
    expect(fixtures).toHaveLength(2);
  });
  for (const file of fixtures) {
    it(`${file} validates as a field bundle`, () => {
      const result = validate("field-bundle", read(`fixtures/synthetic/${file}`));
      expect(result).toMatchObject({ ok: true });
    });
  }
});

describe("rejections", () => {
  const bundle = () => read("fixtures/synthetic/semiarid-winter-cereal.bundle.json");
  const card = () =>
    (read("schemas/evidence-card.schema.json").examples as object[])[0] as Record<string, unknown>;

  it("rejects a bundle whose series lacks provenance", () => {
    const b = bundle();
    const series = b.series as Record<string, unknown>[];
    delete series[0]?.provenance;
    const result = validate("field-bundle", b);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toContain("provenance");
  });

  it("rejects unknown fields on a bundle", () => {
    expect(validate("field-bundle", { ...bundle(), extra: 1 }).ok).toBe(false);
  });

  for (const field of [
    "why",
    "evidence",
    "benefits",
    "gaps",
    "risks",
    "score",
    "resilience_headline",
    "confidence",
    "contributions",
  ]) {
    it(`rejects an evidence card missing ${field}`, () => {
      const c = card();
      delete c[field];
      expect(validate("evidence-card", c).ok).toBe(false);
    });
  }

  it("rejects an evidence item without source", () => {
    const c = card();
    const item = { ...(c.evidence as Record<string, unknown>[])[0] };
    delete item.source;
    expect(validate("evidence-card", { ...c, evidence: [item] }).ok).toBe(false);
  });

  it("rejects an unknown tool call", () => {
    expect(validate("assistant-tools", { tool: "delete_field", input: {} }).ok).toBe(false);
  });
});

describe("validate", () => {
  it("validates a definition by fragment", () => {
    const ok = validate("assistant-tools#/$defs/DefineTermOutput", {
      term: "ET0",
      definition: "x",
    });
    expect(ok.ok).toBe(true);
    expect(validate("assistant-tools#/$defs/DefineTermOutput", { term: "ET0" }).ok).toBe(false);
  });

  it("reports unknown schemas", () => {
    expect(validate("nope", {})).toEqual({ ok: false, errors: ["Unknown schema: nope"] });
  });
});
