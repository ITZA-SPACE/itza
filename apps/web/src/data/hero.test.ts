import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validate } from "@itza/engine/contracts";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { roundGeometry } from "./geometry";
import { HERO_FIELDS } from "./hero";

const root = resolve(import.meta.dirname, "../../../..");
const bundles = resolve(root, "apps/web/public/bundles");

interface YamlField {
  id: string;
  role: string;
  region_pack: string;
  geometry: unknown;
}

const yaml = parse(readFileSync(resolve(root, "pipelines/hero_fields.yaml"), "utf8")) as {
  fields: YamlField[];
};

describe("hero fields", () => {
  it("lists every field of pipelines/hero_fields.yaml, and only those", () => {
    const fromYaml = yaml.fields.map(({ id, role, region_pack, geometry }) => ({
      id,
      role,
      regionPack: region_pack,
      geometry,
    }));
    const fromApp = HERO_FIELDS.map(({ id, role, regionPack, geometry }) => ({
      id,
      role,
      regionPack,
      geometry,
    }));
    expect(fromApp).toEqual(fromYaml);
  });

  it("has one story field and at least three proof fields", () => {
    expect(HERO_FIELDS.filter((h) => h.role === "story")).toHaveLength(1);
    expect(HERO_FIELDS.filter((h) => h.role === "proof").length).toBeGreaterThanOrEqual(3);
  });

  it("has unique ids", () => {
    expect(new Set(HERO_FIELDS.map((h) => h.id)).size).toBe(HERO_FIELDS.length);
  });

  describe.each(HERO_FIELDS.map((h) => [h.id, h] as const))("%s", (id, hero) => {
    const bundle = JSON.parse(readFileSync(resolve(bundles, id, "bundle.json"), "utf8"));

    it("has a schema-valid bundle for the same outline", () => {
      const checked = validate("field-bundle", bundle);
      expect(checked.ok).toBe(true);
      expect(roundGeometry(bundle.field.geometry)).toEqual(roundGeometry(hero.geometry));
    });

    it("carries no placeholder or synthetic data", () => {
      expect(JSON.stringify(bundle)).not.toMatch(/synthetic|placeholder/i);
    });
  });
});
