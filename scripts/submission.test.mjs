import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReferences, countSlides } from "./submission.mjs";

test("references keep the register sections and absolutize repo links", () => {
  const out = buildReferences("# T\nintro\n\n## 1. NASA data\n[x](data-sources.yaml)\n<!-- licenses:begin (g) -->\nrow\n<!-- licenses:end -->\n");
  assert.match(out, /## 1\. NASA data/);
  assert.match(out, /blob\/main\/data-sources\.yaml/);
  assert.doesNotMatch(out, /licenses:begin/);
  assert.doesNotMatch(out, /intro/);
});

test("counts slides split by --- lines", () => {
  assert.equal(countSlides("# a\n---\n# b\n---\n# c\n"), 3);
});
