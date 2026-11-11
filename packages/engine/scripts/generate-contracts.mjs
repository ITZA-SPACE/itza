// Generates TypeScript types from ../../schemas into src/contracts. Run: pnpm schemas:generate
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = join(root, "..", "..", "schemas");
const outDir = join(root, "src", "contracts");

export const SCHEMA_FILES = [
  "common",
  "provenance",
  "canonical-series",
  "field-bundle",
  "engine-input",
  "engine-output",
  "evidence-card",
  "assistant-tools",
];

const BANNER = "// Generated from schemas/ by `pnpm schemas:generate`. Do not edit by hand.";
const seen = new Set();
const indexLines = [BANNER];

for (const name of SCHEMA_FILES) {
  const file = `${name}.schema.json`;
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf8"));
  const ts = await compile(schema, schema.title, {
    cwd: `${schemasDir}/`,
    bannerComment: BANNER,
    additionalProperties: false,
    format: true,
  });
  writeFileSync(join(outDir, `${name}.ts`), ts);
  const names = [...ts.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]);
  const fresh = names.filter((n) => !seen.has(n)).sort();
  for (const n of fresh) seen.add(n);
  if (fresh.length > 0) indexLines.push(`export type { ${fresh.join(", ")} } from "./${name}.ts";`);
}

indexLines.push(
  'export { SCHEMA_IDS, type SchemaId, validate, ContractValidationError } from "./validate.ts";',
);
writeFileSync(join(outDir, "index.ts"), `${indexLines.join("\n")}\n`);
