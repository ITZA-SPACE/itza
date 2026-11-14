import type { EngineOutput, Priorities } from "../contracts";
import type { Exclusion } from "../decisions";
import type { ReplayRequest } from "../replay";
import type {
  CompareRequest,
  CompareResult,
  FutureRequest,
  FutureResult,
  ReweighRequest,
  TimelineResult,
  Weighted,
} from "./compareTypes";

/** Messages the page sends to the replay worker. `id` pairs a response with its request. */
export type WorkerRequest =
  | { id: number; type: "runReplay"; payload: ReplayRequest }
  | { id: number; type: "rescore"; payload: { priorities: Priorities } }
  | { id: number; type: "compare"; payload: CompareRequest }
  | { id: number; type: "reweigh"; payload: ReweighRequest }
  | { id: number; type: "timeline"; payload: { season: string } }
  | { id: number; type: "whyNot"; payload: { crop: string } }
  | { id: number; type: "future"; payload: FutureRequest };

export interface WorkerFailure {
  name: string;
  message: string;
}

/** What a successful request returns; the client narrows it by the request it sent. */
export type WorkerResult =
  | EngineOutput
  | CompareResult
  | Weighted
  | TimelineResult
  | Exclusion
  | FutureResult;

export type WorkerResponse =
  | { id: number; ok: true; result: WorkerResult }
  | { id: number; ok: false; error: WorkerFailure };
