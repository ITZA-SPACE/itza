import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineOutput } from "../../src/contracts";
import {
  createReplayClient,
  createReplayHandler,
  ReplayWorkerError,
  type WorkerLike,
  type WorkerRequest,
} from "../../src/worker";
import { loadBundle } from "../physics/helpers";
import { makeInput, PRIORITIES } from "../replay/helpers";

const bundle = loadBundle("semi-arid-winter-cereal");
const input = makeInput({ monte_carlo_draws: 20 });
const request = (id = 1): WorkerRequest => ({ id, type: "runReplay", payload: { bundle, input } });

function ok(response: ReturnType<ReturnType<typeof createReplayHandler>>): EngineOutput {
  if (!response.ok) throw new Error(`${response.error.name}: ${response.error.message}`);
  return response.result;
}

describe("replay handler", () => {
  it("runs a replay and returns schema-valid output for the request id", () => {
    const handle = createReplayHandler();
    const response = handle(request(7));
    expect(response.id).toBe(7);
    const out = ok(response);
    expect(out.schema).toBe("engine-output/1.0");
    expect(out.results).toHaveLength(10);
  });

  it("re-scores the last replay with new weights, changing the ranking but not the seasons", () => {
    const handle = createReplayHandler();
    const first = ok(handle(request()));
    const second = ok(
      handle({
        id: 2,
        type: "rescore",
        payload: { priorities: { ...PRIORITIES, water: 0, nitrogen: 5, erosion: 0 } },
      }),
    );
    expect(second.results.map((r) => r.rotation_id)).not.toEqual(
      first.results.map((r) => r.rotation_id),
    );
    expect(second.results.map((r) => r.rotation_id).sort()).toEqual(
      first.results.map((r) => r.rotation_id).sort(),
    );
    expect(second.seed).toBe(first.seed);
  });

  it("fails clearly when re-scoring before any replay", () => {
    const response = createReplayHandler()({
      id: 3,
      type: "rescore",
      payload: { priorities: PRIORITIES },
    });
    expect(response).toMatchObject({ id: 3, ok: false, error: { name: "ReplayRequestError" } });
  });

  it("rejects input that breaks its schema, naming the problem", () => {
    const handle = createReplayHandler();
    const bad = { ...input, seed: -1 };
    const response = handle({ id: 4, type: "runReplay", payload: { bundle, input: bad } });
    expect(response.ok).toBe(false);
    if (!response.ok) {
      expect(response.error.name).toBe("ValidationError");
      expect(response.error.message).toMatch(/Engine input does not match its schema/);
    }
  });

  it("rejects a bundle that breaks its schema", () => {
    const response = createReplayHandler()({
      id: 5,
      type: "runReplay",
      payload: { bundle: { ...bundle, schema: "nope" } as never, input },
    });
    expect(response).toMatchObject({ ok: false, error: { name: "ValidationError" } });
  });

  it("rejects out-of-range priorities on re-score and keeps the earlier replay usable", () => {
    const handle = createReplayHandler();
    ok(handle(request()));
    const bad = handle({
      id: 6,
      type: "rescore",
      payload: { priorities: { ...PRIORITIES, water: 9 } },
    });
    expect(bad).toMatchObject({ ok: false, error: { name: "ValidationError" } });
    expect(
      ok(handle({ id: 7, type: "rescore", payload: { priorities: PRIORITIES } })).results,
    ).toHaveLength(10);
  });

  it("reports engine errors such as an unsupported scenario instead of throwing", () => {
    const response = createReplayHandler()({
      id: 8,
      type: "runReplay",
      payload: {
        bundle,
        input: { ...input, scenario: { id: "hot", kind: "slider", delta_temp_c: 2 } },
      },
    });
    expect(response).toMatchObject({ id: 8, ok: false, error: { name: "RangeError" } });
  });

  it("answers an unknown message with an error and id -1", () => {
    const handle = createReplayHandler();
    expect(handle({ nonsense: true })).toMatchObject({ id: -1, ok: false });
    expect(handle(null)).toMatchObject({ id: -1, ok: false });
    expect(handle({ id: 2, type: "other" })).toMatchObject({ id: -1, ok: false });
  });
});

describe("replay client", () => {
  function fakeWorker(): WorkerLike {
    const handle = createReplayHandler();
    const listeners: ((event: { data: unknown }) => void)[] = [];
    return {
      postMessage(message) {
        const response = handle(message);
        queueMicrotask(() => {
          for (const l of listeners) l({ data: response });
        });
      },
      addEventListener(type: string, listener: (event: { data: unknown }) => void) {
        if (type === "message") listeners.push(listener);
      },
    };
  }

  it("resolves runReplay and rescore with the worker's output", async () => {
    const client = createReplayClient(fakeWorker());
    const first = await client.runReplay({ bundle, input });
    const second = await client.rescore({ ...PRIORITIES, water: 0, income: 0 });
    expect(first.results).toHaveLength(10);
    expect(second.results).toHaveLength(10);
  });

  it("rejects with the worker's error name and message", async () => {
    const client = createReplayClient(fakeWorker());
    await expect(client.rescore(PRIORITIES)).rejects.toThrow(ReplayWorkerError);
    await expect(client.rescore(PRIORITIES)).rejects.toThrow(/Call runReplay before rescore/);
  });

  it("ignores responses it did not ask for and pairs concurrent requests by id", async () => {
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const sent: WorkerRequest[] = [];
    const client = createReplayClient({
      postMessage: (m) => void sent.push(m),
      addEventListener: (type: string, l: (event: { data: unknown }) => void) => {
        if (type === "message") listeners.push(l);
      },
    });
    const a = client.rescore(PRIORITIES);
    const b = client.rescore({ ...PRIORITIES, water: 1 });
    const result = (seed: number) => ({
      schema: "engine-output/1.0",
      scenario_id: "x",
      seed,
      results: [],
    });
    listeners[0]?.({ data: { id: 999, ok: true, result: result(0) } });
    listeners[0]?.({ data: { id: sent[1]?.id, ok: true, result: result(2) } });
    listeners[0]?.({ data: { id: sent[0]?.id, ok: true, result: result(1) } });
    expect((await a).seed).toBe(1);
    expect((await b).seed).toBe(2);
  });
});

describe("replay client on a crashed worker", () => {
  it("rejects every pending request when the worker errors", async () => {
    let onError: ((event: { message?: string }) => void) | undefined;
    const client = createReplayClient({
      postMessage: () => {},
      addEventListener: (type: string, l: (event: never) => void) => {
        if (type === "error") onError = l as (event: { message?: string }) => void;
      },
    });
    const a = client.rescore(PRIORITIES);
    const b = client.rescore(PRIORITIES);
    onError?.({ message: "boom" });
    await expect(a).rejects.toThrow(/boom/);
    await expect(b).rejects.toThrow(ReplayWorkerError);
  });
});

describe("worker entry", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("answers messages posted to the worker scope", async () => {
    const posted: unknown[] = [];
    const scope = {
      onmessage: null as null | ((event: { data: unknown }) => void),
      postMessage: (m: unknown) => void posted.push(m),
    };
    const original = globalThis as unknown as typeof scope;
    const previous = { onmessage: original.onmessage, postMessage: original.postMessage };
    original.postMessage = scope.postMessage;
    try {
      await import("../../src/worker/entry");
      expect(typeof original.onmessage).toBe("function");
      original.onmessage?.({
        data: { id: 9, type: "rescore", payload: { priorities: PRIORITIES } },
      });
      expect(posted).toHaveLength(1);
      expect(posted[0]).toMatchObject({ id: 9, ok: false });
    } finally {
      original.onmessage = previous.onmessage;
      original.postMessage = previous.postMessage;
    }
  });
});
