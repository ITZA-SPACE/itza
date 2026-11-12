import { expect, it } from "vitest";
import { analyseFieldMemory } from "../src/memory";
import { KINDS_25, syntheticSources } from "../test/memory/helpers";

it("labels a 25-year series in under 50 ms", () => {
  const input = { series: syntheticSources({ kinds: KINDS_25, cloud: 0.1, hlsYears: 8 }) };
  analyseFieldMemory(input); // warm-up
  const runs = 20;
  const start = performance.now();
  for (let i = 0; i < runs; i++) analyseFieldMemory(input);
  const mean = (performance.now() - start) / runs;
  expect(mean).toBeLessThan(50);
});
