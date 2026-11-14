import { createReplayClient, type ReplayClient } from "@itza/engine/worker";
import ReplayWorker from "@itza/engine/worker/entry?worker";

let client: ReplayClient | null = null;

/**
 * A second replay worker for the robustness check. The comparison on screen lives in the first
 * worker's session, so testing other weather there would replace it.
 */
export function robustnessEngine(): ReplayClient {
  client ??= createReplayClient(new ReplayWorker());
  return client;
}
