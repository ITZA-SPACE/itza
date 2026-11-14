import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EngineInput } from "../../packages/engine/src/contracts";
import { validate } from "../../packages/engine/src/contracts";
import { isCrop, simulateTimeline } from "../../packages/engine/src/physics";
import {
  createReplayWorld,
  planOf,
  planRotation,
  scoreReplay,
  simulateReplay,
} from "../../packages/engine/src/replay";

/** Fixed continuous-wheat counterfactual, not the inferred or farmer-confirmed rotation. */
export function exportReplay(root: string) {
  const input: EngineInput = {
    schema: "engine-input/1.0",
    rotations: [
      {
        id: "continuous_wheat",
        name: "Continuous winter wheat",
        seasons: [{ crop: "winter_wheat" }],
      },
    ],
    soil: {},
    priorities: {
      water: 3,
      soil_health: 3,
      nitrogen: 3,
      erosion: 3,
      forage: 3,
      income: 3,
      pest_break: 3,
    },
    constraints: { irrigation: { level: "none" }, livestock: false },
    scenario: { id: "history", kind: "history" },
    seed: 42,
    monte_carlo_draws: 0,
  };
  const fields = [1, 2, 3].map((n) => {
    const id = `akron-proof-${n}`;
    const path = resolve(root, `apps/web/public/bundles/${id}/bundle.json`);
    const checked = validate("field-bundle", JSON.parse(readFileSync(path, "utf8")));
    if (!checked.ok) throw new Error(checked.errors.join("; "));
    const bundle = checked.data;
    const { pack, ctx } = createReplayWorld({ bundle, input, packId: "us-central-great-plains" });
    const plan = planRotation(ctx, planOf(pack, input.rotations[0]));
    const timeline = simulateTimeline({
      startDay: ctx.forcing.startDay,
      precip: ctx.forcing.precip,
      et0: ctx.forcing.et0,
      soil: ctx.soil,
      segments: plan.seasons.flatMap((s) =>
        s.crop && isCrop(s.entry) ? [{ crop: s.crop, sowingDay: s.sowingDay }] : [],
      ),
    });
    const output = scoreReplay(
      simulateReplay({ bundle, input, packId: "us-central-great-plains" }),
      input.priorities,
    );
    const months = new Map<string, { total: number; days: number; valid: boolean }>();
    timeline.eta.forEach((value, i) => {
      const period = new Date((ctx.forcing.startDay + i) * 86400000).toISOString().slice(0, 7);
      const bucket = months.get(period) ?? { total: 0, days: 0, valid: true };
      bucket.total += value;
      bucket.days += 1;
      bucket.valid &&= ctx.forcing.observed[i] === 1;
      months.set(period, bucket);
    });
    const et = [...months].flatMap(([period, bucket]) => {
      const [year, month] = period.split("-").map(Number);
      const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
      // Discard the initialization year and all months containing filled weather days.
      return year > 2008 && bucket.valid && bucket.days === days
        ? [{ period, value: bucket.total }]
        : [];
    });
    return {
      id,
      bundle_sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      centroid: bundle.field.centroid,
      agricultural_year_start_month: pack.calendar.agricultural_year_start_month.value,
      scores: output.results[0]?.seasons.map((s) => ({
        year: Number(s.season.slice(0, 4)) + 1,
        season: s.season,
        value: s.composite,
      })),
      // Day-number origin is Unix epoch, shared with the engine's forcing/calendar code.
      et,
      forcing_gaps: ctx.forcing.gaps,
    };
  });
  writeFileSync(
    resolve(root, "pipelines/validation/data/replay.json"),
    `${JSON.stringify(
      {
        source_sha256: createHash("sha256")
          .update(readFileSync(resolve(root, "pipelines/validation/replay.ts")))
          .digest("hex"),
        input,
        fields,
      },
      null,
      2,
    )}\n`,
  );
}
