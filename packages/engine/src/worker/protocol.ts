import type { EngineOutput, Priorities } from "../contracts";
import type { ReplayRequest } from "../replay";

/** Messages the page sends to the replay worker. `id` pairs a response with its request. */
export type WorkerRequest =
  | { id: number; type: "runReplay"; payload: ReplayRequest }
  | { id: number; type: "rescore"; payload: { priorities: Priorities } };

export interface WorkerFailure {
  name: string;
  message: string;
}

export type WorkerResponse =
  | { id: number; ok: true; result: EngineOutput }
  | { id: number; ok: false; error: WorkerFailure };
