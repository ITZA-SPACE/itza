import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack } from "@itza/knowledge";
import { describe, expect, it } from "vitest";
import { validate } from "../../src/contracts";
import {
  type CompareRequest,
  type CompareResult,
  createReplayClient,
  createReplayHandler,
  type FutureResult,
  type TimelineResult,
  type Weighted,
  type WorkerLike,
} from "../../src/worker";
import { loadBundle } from "../physics/helpers";
import { makeInput, PRIORITIES } from "../replay/helpers";

const bundle = loadBundle("semi-arid-winter-cereal");
const { rotations: _unused, ...baseInput } = makeInput({ monte_carlo_draws: 20 });
const request = (over: Partial<CompareRequest> = {}): CompareRequest => ({
  bundle,
  input: baseInput,
  ...over,
});

function session() {
  const handle = createReplayHandler();
  let id = 0;
  const call = <T>(type: string, payload: unknown): T => {
    const response = handle({ id: ++id, type, payload } as never);
    if (!response.ok) throw new Error(`${response.error.name}: ${response.error.message}`);
    return response.result as T;
  };
  return { call, handle };
}

describe("compare", () => {
  const { call } = session();
  const result = call<CompareResult>("compare", request());

  it("compares the current rotation with generated alternatives, with schema-valid cards", () => {
    expect(result.baselineId).toBe("wheat_continuous");
    expect(result.cards.length).toBeGreaterThanOrEqual(3);
    expect(result.cards.filter((c) => c.is_baseline)).toHaveLength(1);
    for (const card of result.cards) expect(validate("evidence-card", card).ok).toBe(true);
    expect(validate("engine-output", result.output).ok).toBe(true);
    expect(result.output.results.map((r) => r.rotation_id).sort()).toEqual(
      result.cards.map((c) => c.rotation_id).sort(),
    );
    expect(result.rotations.every((r) => r.name.length > 0)).toBe(true);
    expect(result.label).toBe("model-based counterfactual, not measured yield");
    expect(result.packId).toBe("dz-high-plains");
  });

  it("lists the seasons all rotations share and opens on the worst one", () => {
    expect(result.seasons.map((s) => s.label)).toEqual(["2021-22", "2022-23", "2023-24"]);
    const lowest = [...result.seasons].sort((a, b) => a.meanScore - b.meanScore)[0];
    expect(result.worstSeason).toBe(lowest?.label);
  });

  it("names the crops it left out and why", () => {
    expect(result.leftOut.length).toBeGreaterThan(0);
    for (const crop of result.leftOut) {
      expect(crop.name.length).toBeGreaterThan(0);
      expect(crop.reason.length).toBeGreaterThan(10);
    }
  });

  it("names a current rotation without a name by its crops", () => {
    const { call: other } = session();
    const unnamed = { id: "current", seasons: [{ crop: "durum_wheat" }, { crop: "fallow" }] };
    const r = other<CompareResult>(
      "compare",
      request({ input: { ...baseInput, baseline: unnamed as never } }),
    );
    expect(r.rotations.find((x) => x.id === "current")?.name).toBe("Durum wheat, Fallow");
  });

  it("respects the number of alternatives asked for", () => {
    const { call: other } = session();
    const small = other<CompareResult>("compare", request({ topN: 2 }));
    expect(small.cards).toHaveLength(3);
  });

  it("works without a current rotation", () => {
    const { baseline: _b, ...noBaseline } = baseInput;
    const { call: other } = session();
    const r = other<CompareResult>("compare", request({ input: noBaseline }));
    expect(r.baselineId).toBeNull();
    expect(r.cards.every((c) => !c.is_baseline)).toBe(true);
  });

  it("fails clearly when nothing can be compared", () => {
    const pack = loadPack("dz-high-plains");
    const { baseline: _b, ...noBaseline } = baseInput;
    const { handle } = session();
    const response = handle({
      id: 1,
      type: "compare",
      payload: request({
        input: {
          ...noBaseline,
          constraints: { ...baseInput.constraints, excluded_crops: pack.crops.map((c) => c.id) },
        },
      }),
    } as never);
    expect(response).toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/No rotation to compare/) },
    });
  });
});

describe("reweigh", () => {
  it("re-ranks under new priorities with fresh, valid cards and no new simulation", () => {
    const { call } = session();
    const first = call<CompareResult>("compare", request());
    const t0 = performance.now();
    const next = call<Weighted>("reweigh", {
      priorities: { ...PRIORITIES, water: 0, nitrogen: 5, erosion: 0, pest_break: 0 },
    });
    const ms = performance.now() - t0;
    expect(next.output.results.map((r) => r.rotation_id)).not.toEqual(
      first.output.results.map((r) => r.rotation_id),
    );
    for (const card of next.cards) {
      expect(validate("evidence-card", card).ok).toBe(true);
      const total = Object.values(card.contributions).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(card.score, 9);
    }
    expect(ms).toBeLessThan(2000);
  });

  it("needs a comparison first and rejects invalid priorities", () => {
    const { handle, call } = session();
    expect(
      handle({ id: 1, type: "reweigh", payload: { priorities: PRIORITIES } } as never),
    ).toMatchObject({ ok: false });
    call("compare", request());
    expect(
      handle({
        id: 2,
        type: "reweigh",
        payload: { priorities: { ...PRIORITIES, water: 9 } },
      } as never),
    ).toMatchObject({
      ok: false,
      error: { name: "ValidationError" },
    });
  });
});

describe("timeline", () => {
  const { call, handle } = session();
  const compared = call<CompareResult>("compare", request());
  const season = compared.worstSeason as string;
  const timeline = call<TimelineResult>("timeline", { season });

  it("replays the season day by day for every rotation that has it", () => {
    expect(timeline.season).toBe(season);
    expect(timeline.lanes.length).toBe(compared.cards.length);
    expect(timeline.lanes.length).toBeGreaterThanOrEqual(3);
    expect(timeline.days).toBeGreaterThanOrEqual(365);
    expect(timeline.rain).toHaveLength(timeline.days);
    expect(timeline.startDate).toMatch(/^\d{4}-09-01$/);
    for (const lane of timeline.lanes) {
      for (const series of [lane.soilWater, lane.stress, lane.cover, lane.stage])
        expect(series).toHaveLength(timeline.days);
      for (const v of [...lane.soilWater, ...lane.stress, ...lane.cover]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      for (const stage of lane.stage) expect([-1, 0, 1, 2, 3]).toContain(stage);
    }
  });

  it("shows crop seasons growing and fallow bare, with the season's score and band", () => {
    const crop = timeline.lanes.find((l) => l.crop !== "fallow" && l.crop !== "cover_crop");
    expect(crop?.stage.some((s) => s >= 0)).toBe(true);
    expect(Math.max(...(crop?.cover ?? [0]))).toBeGreaterThan(0.3);
    expect(timeline.scores).toHaveLength(timeline.lanes.length);
    for (const s of timeline.scores) {
      expect(s.band?.p10).toBeLessThanOrEqual(s.band?.p90 ?? 1);
    }
  });

  it("carries the observed greenness of the same season", () => {
    expect(timeline.ndvi.length).toBeGreaterThan(15);
    for (const point of timeline.ndvi) {
      expect(point.date >= timeline.startDate).toBe(true);
      expect(point.value).toBeGreaterThanOrEqual(0);
      expect(point.value).toBeLessThanOrEqual(1);
    }
  });

  it("rejects a season that was not replayed and needs a comparison first", () => {
    expect(
      handle({ id: 99, type: "timeline", payload: { season: "1999-00" } } as never),
    ).toMatchObject({ ok: false });
    expect(
      session().handle({ id: 1, type: "timeline", payload: { season: season } } as never),
    ).toMatchObject({ ok: false });
  });
});

describe("whyNot", () => {
  it("names the filter or ranking for a crop and answers for unknown ones", () => {
    const { call } = session();
    const compared = call<CompareResult>("compare", request());
    const left = compared.leftOut[0];
    const explained = call<{ crop: string; excluded: boolean; reason: string }>("whyNot", {
      crop: left?.crop,
    });
    expect(explained.crop).toBe(left?.crop);
    expect(explained.excluded).toBe(true);
    expect(explained.reason).toBe(left?.reason);
    expect(call<{ excluded: boolean }>("whyNot", { crop: "banana" }).excluded).toBe(true);
    expect(
      session().handle({ id: 1, type: "whyNot", payload: { crop: "x" } } as never),
    ).toMatchObject({ ok: false });
  });
});

describe("client", () => {
  it("exposes compare, reweigh, timeline and whyNot as promises", async () => {
    const handle = createReplayHandler();
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const worker: WorkerLike = {
      postMessage(message) {
        const response = handle(message);
        queueMicrotask(() => {
          for (const l of listeners) l({ data: response });
        });
      },
      addEventListener(_t, l) {
        listeners.push(l);
      },
    };
    const client = createReplayClient(worker);
    const compared = await client.compare(request());
    expect(compared.cards.length).toBeGreaterThanOrEqual(3);
    const reweighed = await client.reweigh({ ...PRIORITIES, water: 5 });
    expect(reweighed.cards).toHaveLength(compared.cards.length);
    const line = await client.timeline(compared.worstSeason as string);
    expect(line.lanes.length).toBeGreaterThanOrEqual(3);
    expect((await client.whyNot("banana")).excluded).toBe(true);
  });
});

describe("future", () => {
  const payload = JSON.parse(
    readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../fixtures/projection/setif-2050.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const { call, handle } = session();
  const compared = call<CompareResult>("compare", request());
  const at = (progress: number, ssps?: string[]) =>
    call<FutureResult>("future", { payload, progress, ...(ssps ? { ssps } : {}) });
  const full = at(1);

  it("replays the comparison under the three emissions scenarios, with the model spread", () => {
    expect(full.ssps.map((s) => s.ssp)).toEqual(["ssp126", "ssp245", "ssp370"]);
    expect(full.provenance.future_period).toBe("2041-2060");
    for (const ssp of full.ssps) {
      expect(ssp.rotations.map((r) => r.rotation_id).sort()).toEqual(
        compared.cards.map((c) => c.rotation_id).sort(),
      );
      for (const r of ssp.rotations) {
        expect(r.score.min).toBeLessThanOrEqual(r.score.median);
        expect(r.score.median).toBeLessThanOrEqual(r.score.max);
      }
    }
    expect(full.ssps.flatMap((s) => s.rotations).some((r) => r.score.min < r.score.max)).toBe(true);
  });

  it("gives climate stripes for today and each scenario over the same seasons", () => {
    expect(full.climate.map((r) => r.id)).toEqual(["today", "ssp126", "ssp245", "ssp370"]);
    const labels = full.climate[0]?.seasons.map((s) => s.label);
    for (const row of full.climate) expect(row.seasons.map((s) => s.label)).toEqual(labels);
    const mean = (row: (typeof full.climate)[number]) =>
      row.seasons.reduce((a, s) => a + s.meanTempC, 0) / row.seasons.length;
    const [today, low, mid, high] = full.climate as [
      (typeof full.climate)[number],
      ...(typeof full.climate)[number][],
    ];
    expect(mean(low as never)).toBeGreaterThan(mean(today));
    expect(mean(mid as never)).toBeGreaterThan(mean(low as never));
    expect(mean(high as never)).toBeGreaterThan(mean(mid as never));
  });

  it("moves toward the 2050 result as progress grows, and needs none at today", () => {
    const today = at(0, ["ssp370"]);
    const half = at(0.5, ["ssp370"]);
    expect(today.ssps).toHaveLength(1);
    for (const r of today.ssps[0]?.rotations ?? []) expect(r.score.median).toBe(0);
    const size = (f: FutureResult) =>
      f.ssps[0]?.rotations.reduce((a, r) => a + Math.abs(r.score.median), 0) ?? 0;
    const end = at(1, ["ssp370"]);
    expect(size(half)).toBeGreaterThan(0);
    expect(size(half)).toBeLessThan(size(end));
    expect(half.progress).toBe(0.5);
  });

  it("is quick enough for a slider", () => {
    const t0 = performance.now();
    at(0.75, ["ssp245"]);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("rejects a bad payload, an unknown scenario or progress outside 0 to 1", () => {
    const failure = (payload_: unknown, extra = {}) =>
      handle({ id: 9, type: "future", payload: { payload: payload_, ...extra } } as never);
    expect(failure({ nope: true })).toMatchObject({
      ok: false,
      error: { name: "ValidationError" },
    });
    expect(failure(payload, { ssps: ["ssp999"] })).toMatchObject({ ok: false });
    expect(failure(payload, { progress: 2 })).toMatchObject({
      ok: false,
      error: { name: "ValidationError" },
    });
  });

  it("needs a comparison first", () => {
    expect(
      session().handle({ id: 1, type: "future", payload: { payload } } as never),
    ).toMatchObject({ ok: false });
  });
});
