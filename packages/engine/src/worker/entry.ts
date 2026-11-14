// Web Worker entry: `new Worker(new URL("@itza/engine/worker/entry", import.meta.url), { type: "module" })`.
import { createReplayHandler } from "./handler";

interface WorkerScope {
  onmessage: ((event: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as WorkerScope;
const handle = createReplayHandler();
scope.onmessage = (event) => scope.postMessage(handle(event.data));
