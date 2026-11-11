import { type EngineInput, type Priorities, validate } from "../contracts";
import { type ReplayRun, scoreReplay, simulateReplay } from "../replay";
import type { WorkerRequest, WorkerResponse } from "./protocol";

/** Failure of a request: bad input, bad bundle, or an engine result that breaks its own contract. */
export class ReplayRequestError extends Error {
  constructor(message: string, name = "ReplayRequestError") {
    super(message);
    this.name = name;
  }
}

const MAX_SHOWN_ERRORS = 5;

function check(result: { ok: true } | { ok: false; errors: string[] }, what: string): void {
  if (!result.ok) {
    const shown = result.errors.slice(0, MAX_SHOWN_ERRORS).join("; ");
    throw new ReplayRequestError(`${what} does not match its schema: ${shown}`, "ValidationError");
  }
}

function isRequest(value: unknown): value is WorkerRequest {
  if (typeof value !== "object" || value === null) return false;
  const { id, type } = value as { id?: unknown; type?: unknown };
  return typeof id === "number" && (type === "runReplay" || type === "rescore");
}

/**
 * The replay worker's brain, free of any worker API so it runs the same in Node and in a Web Worker.
 * `runReplay` simulates and keeps the criteria; `rescore` re-ranks them under new priorities without
 * simulating again. Inputs and outputs are checked against the shared schemas.
 */
export function createReplayHandler(): (message: unknown) => WorkerResponse {
  let run: ReplayRun | null = null;
  let input: EngineInput | null = null;

  return (message) => {
    const id = isRequest(message) ? message.id : -1;
    try {
      if (!isRequest(message)) throw new ReplayRequestError("Unknown worker message");
      if (message.type === "runReplay") {
        const { bundle, input: nextInput, packId } = message.payload;
        check(validate("field-bundle", bundle), "Field bundle");
        check(validate("engine-input", nextInput), "Engine input");
        const nextRun = simulateReplay({ bundle, input: nextInput, ...(packId ? { packId } : {}) });
        const result = scoreReplay(nextRun, nextInput.priorities);
        check(validate("engine-output", result), "Engine output");
        run = nextRun;
        input = nextInput;
        return { id, ok: true, result };
      }
      if (!run || !input) throw new ReplayRequestError("Call runReplay before rescore");
      const priorities: Priorities = message.payload.priorities;
      check(validate("engine-input", { ...input, priorities }), "Priorities");
      const result = scoreReplay(run, priorities);
      check(validate("engine-output", result), "Engine output");
      return { id, ok: true, result };
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      return { id, ok: false, error: { name: e.name, message: e.message } };
    }
  };
}
