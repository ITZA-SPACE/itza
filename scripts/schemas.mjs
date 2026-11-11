// Generates TypeScript and Pydantic types from schemas/*.schema.json.
// Usage: node scripts/schemas.mjs [--check]   (--check fails when generated files are stale)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemasDir = join(root, "schemas");
const apiDir = join(root, "services/science-api");
const tsTarget = join(root, "packages/engine/src/contracts/types.generated.ts");
const pyTarget = join(apiDir, "src/itza_science/contracts");

// projection.schema.json is generated from Pydantic by the projection endpoint; keep it out.
const names = [
  "provenance",
  "canonical-series",
  "field-bundle",
  "engine-input",
  "engine-output",
  "evidence-card",
  "assistant-tools",
];

async function buildTs() {
  const aggregate = {
    title: "Contracts",
    type: "object",
    additionalProperties: false,
    required: names,
    properties: Object.fromEntries(names.map((n) => [n, { $ref: `${n}.schema.json` }])),
  };
  return compile(aggregate, "Contracts", {
    cwd: `${schemasDir}/`,
    bannerComment: "/* Generated from schemas/*.schema.json by scripts/schemas.mjs. Do not edit. */",
    additionalProperties: false,
    unreachableDefinitions: true,
  });
}

// Generated in the OS temp dir on purpose: outside the repo, Ruff uses its default
// config, so the output is identical on every machine. The contracts package is
// excluded from the project Ruff config.
function buildPy(work) {
  const input = join(work, "input");
  const outDir = join(work, "out");
  mkdirSync(input, { recursive: true });
  for (const n of names) cpSync(join(schemasDir, `${n}.schema.json`), join(input, `${n}.schema.json`));
  const result = spawnSync(
    "uv",
    [
      "run",
      "datamodel-codegen",
      "--input", input,
      "--input-file-type", "jsonschema",
      "--output", outDir,
      "--output-model-type", "pydantic_v2.BaseModel",
      "--disable-timestamp",
      "--target-python-version", "3.12",
      "--use-standard-collections",
      "--use-union-operator",
      "--use-annotated",
      "--field-constraints",
      "--use-tuple-for-closed-arrays",
      "--formatters", "ruff-format", "ruff-check",
    ],
    { cwd: apiDir, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (result.status !== 0) throw new Error("datamodel-codegen failed");
  // The codegen header carries the temp input directory name; make it stable.
  writeFileSync(join(outDir, "__init__.py"), "# Generated from schemas/*.schema.json by scripts/schemas.mjs. Do not edit.\n");
  return outDir;
}

function readDir(dir) {
  const files = new Map();
  if (!existsSync(dir)) return files;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".py")).sort()) {
    files.set(f, readFileSync(join(dir, f), "utf8"));
  }
  return files;
}

const check = process.argv.includes("--check");
const ts = await buildTs();
const work = mkdtempSync(join(tmpdir(), "itza-contracts-"));
const pyBuild = buildPy(work);

try {
  if (check) {
    const stale = [];
    if (!existsSync(tsTarget) || readFileSync(tsTarget, "utf8") !== ts) stale.push(tsTarget);
    const fresh = readDir(pyBuild);
    const current = readDir(pyTarget);
    for (const [f, content] of fresh) if (current.get(f) !== content) stale.push(join(pyTarget, f));
    for (const f of current.keys()) if (!fresh.has(f)) stale.push(join(pyTarget, f));
    if (stale.length > 0) {
      console.error(`Generated contracts are stale:\n${stale.map((s) => `  ${s}`).join("\n")}\nRun: pnpm schemas:generate`);
      process.exitCode = 1;
    } else {
      console.log("Generated contracts are up to date.");
    }
  } else {
    mkdirSync(dirname(tsTarget), { recursive: true });
    writeFileSync(tsTarget, ts);
    rmSync(pyTarget, { recursive: true, force: true });
    cpSync(pyBuild, pyTarget, { recursive: true });
    console.log(`Wrote ${tsTarget}\nWrote ${pyTarget}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
