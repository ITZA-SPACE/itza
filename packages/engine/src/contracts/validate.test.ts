import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ContractValidationError, validate } from "./validate.ts";

const synthetic = (name: string): unknown =>
  JSON.parse(
    readFileSync(new URL(`../../../../fixtures/synthetic/${name}`, import.meta.url), "utf8"),
  );

const bundles = ["semi-arid-winter-cereal.bundle.json", "fallow-heavy.bundle.json"];

for (const name of bundles) {
  test(`synthetic bundle ${name} validates`, () => {
    validate("field-bundle", synthetic(name));
  });
}

test("examples validate against their schemas", () => {
  validate("engine-input", synthetic("engine-input.example.json"));
  validate("engine-output", synthetic("engine-output.example.json"));
  validate("evidence-card", synthetic("evidence-card.example.json"));
  for (const message of synthetic("assistant-tools.example.json") as unknown[]) {
    validate("assistant-tools", message);
  }
});

test("a series without provenance rejects the bundle", () => {
  const bundle = synthetic(bundles[0] as string) as { series: Record<string, unknown>[] };
  delete bundle.series[0]?.provenance;
  assert.throws(() => validate("field-bundle", bundle), ContractValidationError);
});

test("a series with an unknown variable rejects the bundle", () => {
  const bundle = synthetic(bundles[0] as string) as { series: Record<string, unknown>[] };
  if (bundle.series[0]) bundle.series[0].var = "rainfall";
  assert.throws(() => validate("field-bundle", bundle), ContractValidationError);
});

test("an evidence card missing a mandatory field is rejected", () => {
  for (const field of ["why", "evidence", "benefits", "gaps", "risks", "confidence"]) {
    const card = synthetic("evidence-card.example.json") as Record<string, unknown>;
    delete card[field];
    assert.throws(() => validate("evidence-card", card), ContractValidationError, field);
  }
});

test("an evidence item without a source is rejected", () => {
  const card = synthetic("evidence-card.example.json") as {
    evidence: Record<string, unknown>[];
  };
  delete card.evidence[0]?.source;
  assert.throws(() => validate("evidence-card", card), ContractValidationError);
});

test("an engine input with an out-of-range priority is rejected", () => {
  const input = synthetic("engine-input.example.json") as { priorities: Record<string, number> };
  input.priorities.save_water = 9;
  assert.throws(() => validate("engine-input", input), ContractValidationError);
});

test("an assistant message with an unknown tool is rejected", () => {
  assert.throws(
    () => validate("assistant-tools", { tool: "drop_tables", input: {} }),
    ContractValidationError,
  );
});
