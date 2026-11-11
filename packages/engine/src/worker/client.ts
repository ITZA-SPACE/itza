import type { EngineOutput, Priorities } from "../contracts";
import type { ReplayRequest } from "../replay";
import type { WorkerFailure, WorkerRequest, WorkerResponse } from "./protocol";

/** The part of `Worker` the client needs, so tests can use a stand-in. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
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
}

/** Promise API over the replay worker's message protocol. */
export function createReplayClient(worker: WorkerLike): ReplayClient {
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (result: EngineOutput) => void; reject: (error: Error) => void }
  >();
  worker.addEventListener("message", (event) => {
    const response = event.data as WorkerResponse;
    const entry = pending.get(response.id);
    if (!entry) return;
    pending.delete(response.id);
    if (response.ok) entry.resolve(response.result);
    else entry.reject(new ReplayWorkerError(response.error));
  });
  const send = (build: (id: number) => WorkerRequest) =>
    new Promise<EngineOutput>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      worker.postMessage(build(id));
    });
  return {
    runReplay: (payload) => send((id) => ({ id, type: "runReplay", payload })),
    rescore: (priorities) => send((id) => ({ id, type: "rescore", payload: { priorities } })),
  };
}
