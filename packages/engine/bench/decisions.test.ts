import { describe, expect, it } from "vitest";
import { generateCandidates, sliderScenario } from "../src/decisions";
import { scoreReplay, simulateReplay } from "../src/replay";
import { makeBundle, makeInput, PRIORITIES } from "../test/replay/helpers";

// Budgets from the decisions acceptance criteria, run with `pnpm --filter @itza/engine bench`
// (outside the coverage-gated suite: instrumentation distorts timings). Best of three after a warm-up.
const best = (run: () => void, times = 3): number => {
  run();
  return Math.min(
    ...Array.from({ length: times }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }),
  );
};

describe("budgets", () => {
  const bundle = makeBundle(25);
  const constraints = { irrigation: { level: "none" as const }, livestock: true };

  it("generates and scores 500 candidates in under 500 ms", () => {
    const input = makeInput({ constraints });
    let considered = 0;
    const ms = best(() => {
      considered = generateCandidates({ bundle, input }, { maxScored: 500 }).considered;
    });
    expect(considered).toBeGreaterThanOrEqual(400);
    expect(ms).toBeLessThan(500);
  });

  it("reruns a scenario for 10 rotations, with Monte Carlo bands, in under 1 s", () => {
    const input = makeInput({ scenario: sliderScenario("dry_hot", -20, 2) });
    expect(input.rotations).toHaveLength(10);
    const ms = best(() => {
      scoreReplay(simulateReplay({ bundle, input }), PRIORITIES);
    });
    expect(ms).toBeLessThan(1000);
  });
});
