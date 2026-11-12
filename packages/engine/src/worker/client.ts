import type { EngineOutput, Priorities } from "../contracts";
import type { Exclusion } from "../decisions";
import type { ReplayRequest } from "../replay";
import type { CompareRequest, CompareResult, TimelineResult, Weighted } from "./compareTypes";
import type { WorkerFailure, WorkerRequest, WorkerResponse, WorkerResult } from "./protocol";

/** The part of `Worker` the client needs, so tests can use a stand-in. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "error", listener: (event: { message?: string }) => void): void;
}

export class ReplayWorkerError extends Error {
  constructor(failure: WorkerFailure) {
    super(failure.message);
    this.name = failure.name;
  }
}

export interface ReplayClient {
  runReplay(request: ReplayRequest): Promise<EngineOutput>;
  /** Re-ranks the last replay under new priorities; no re-simulation. */
  rescore(priorities: Priorities): Promise<EngineOutput>;
  /** Generates candidates, replays them and builds the evidence cards. */
  compare(request: CompareRequest): Promise<CompareResult>;
  /** Re-ranks the last comparison under new priorities, with fresh cards; no re-simulation. */
  reweigh(priorities: Priorities): Promise<Weighted>;
  /** The last comparison's rotations, day by day, for one replayed season. */
  timeline(season: string): Promise<TimelineResult>;
  /** Why a crop is, or is not, among the last comparison's candidates. */
  whyNot(crop: string): Promise<Exclusion>;
}

/** Promise API over the replay worker's message protocol. */
export function createReplayClient(worker: WorkerLike): ReplayClient {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (result: WorkerResult) => void; reject: (error: Error) => void }
  >();
  worker.addEventListener("message", (event) => {
    const response = event.data as WorkerResponse;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new ReplayWorkerError(response.error));
  });
  // A crashed worker never answers; fail every pending request instead of leaving it hanging.
  worker.addEventListener("error", (event) => {
    const failure = { name: "WorkerCrashError", message: event.message || "Replay worker failed" };
    for (const entry of pending.values()) entry.reject(new ReplayWorkerError(failure));
    pending.clear();
  });
  const send = <T extends WorkerResult>(build: (id: number) => WorkerRequest) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolve as (result: WorkerResult) => void, reject });
      worker.postMessage(build(id));
    });
  return {
    runReplay: (payload) => send<EngineOutput>((id) => ({ id, type: "runReplay", payload })),
    rescore: (priorities) =>
      send<EngineOutput>((id) => ({ id, type: "rescore", payload: { priorities } })),
    compare: (payload) => send<CompareResult>((id) => ({ id, type: "compare", payload })),
    reweigh: (priorities) =>
      send<Weighted>((id) => ({ id, type: "reweigh", payload: { priorities } })),
    timeline: (season) =>
      send<TimelineResult>((id) => ({ id, type: "timeline", payload: { season } })),
    whyNot: (crop) => send<Exclusion>((id) => ({ id, type: "whyNot", payload: { crop } })),
  };
}
