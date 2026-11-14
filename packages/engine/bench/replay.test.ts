import { describe, expect, it } from "vitest";
import { scoreReplay, simulateReplay } from "../src/replay";
import { makeBundle, makeInput, PRIORITIES, ROTATIONS } from "../test/replay/helpers";

// Budgets from the Season Replay acceptance criteria, run with `pnpm --filter @itza/engine bench`.
// They live outside the coverage-gated suite because V8 coverage instrumentation slows the replay
// about nine times. Measured on an Apple M-series laptop with Node 26: about 0.7 s for the replay
// and 15 ms for a re-score. The replay takes the best of three runs after a warm-up, as benchmarks
// do, so one slow run on a busy machine does not fail it.
describe("budgets", () => {
  const bundle = makeBundle(25);
  const input = makeInput();

  it("replays 10 rotations x 25 seasons x daily steps with 200 Monte Carlo draws in under 1 s", () => {
    expect(ROTATIONS).toHaveLength(10);
    simulateReplay({ bundle, input: makeInput({ monte_carlo_draws: 10 }) });
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const run = simulateReplay({ bundle, input });
      times.push(performance.now() - start);
      expect(run.drawCount).toBe(200);
      expect(run.rotations).toHaveLength(10);
      expect(run.rotations[0]?.labels.length).toBeGreaterThanOrEqual(24);
    }
    expect(Math.min(...times)).toBeLessThan(1000);
  });

  it("re-scores 10 rotations with new weights in under 100 ms without re-simulating", () => {
    const run = simulateReplay({ bundle, input });
    scoreReplay(run, PRIORITIES);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      scoreReplay(run, { ...PRIORITIES, water: i, erosion: 5 - i });
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[2]).toBeLessThan(100);
  });
});
