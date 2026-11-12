import { createReplayClient, type ReplayClient } from "@itza/engine/worker";
import ReplayWorker from "@itza/engine/worker/entry?worker";

let client: ReplayClient | null = null;

/** The engine's worker, started on first use so the map and the rest of the app do not wait for it. */
export function engine(): ReplayClient {
  client ??= createReplayClient(new ReplayWorker());
  return client;
}
