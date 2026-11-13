// Offline check of the license gate: `node --test scripts/`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { acceptable, manifestProblems, pythonLicense } from "./licenses.mjs";

const run = (dir) =>
  spawnSync("node", ["scripts/licenses.mjs", "--check", "--fixture", `scripts/fixtures/${dir}`], {
    encoding: "utf8",
  });

test("accepts OSI and public-domain expressions", () => {
  assert.ok(acceptable("MIT"));
  assert.ok(acceptable("(MIT OR Apache-2.0)"));
  assert.ok(acceptable("GPL-3.0-only OR MIT"));
  assert.ok(acceptable("BSD-3-Clause AND CC0-1.0"));
});

test("rejects non-commercial, unknown and mixed-AND expressions", () => {
  assert.ok(!acceptable("CC-BY-NC-SA-4.0"));
  assert.ok(!acceptable("UNKNOWN"));
  assert.ok(!acceptable("MIT AND CC-BY-NC-4.0"));
});

test("reads Python metadata from expression, field or classifier", () => {
  assert.equal(pythonLicense("License-Expression: MIT\n"), "MIT");
  assert.equal(pythonLicense("License: BSD-3-Clause\n"), "BSD-3-Clause");
  assert.equal(
    pythonLicense("License: Dual License\nClassifier: License :: OSI Approved :: BSD License\n"),
    "BSD License (OSI)",
  );
  assert.equal(pythonLicense("Name: x\n"), "UNKNOWN");
});

test("--check passes on a clean fixture lockfile", () => {
  assert.equal(run("licenses-ok").status, 0);
});

test("--check fails on a fixture lockfile with a non-OSI dependency", () => {
  const result = run("licenses-bad");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /non-commercial-lib/);
  assert.match(result.stderr, /mystery/);
});

test("every data source carries a license, a citation and (DAAC products) a DOI", () => {
  assert.deepEqual(manifestProblems(readFileSync("data-sources.yaml", "utf8")), []);
  const bare = "sources:\n  - id: x\n    provider: LP DAAC\n    product: P\n";
  assert.equal(manifestProblems(bare).length, 3);
});
