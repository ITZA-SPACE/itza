import { useEffect, useState } from "react";
import type { TwinFrame } from "./frames";

const CONCURRENCY = 6;

/** Fetches and decodes a frame; null when the frame is missing or will not decode. */
async function decode(frame: TwinFrame, signal: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(frame.url, { signal });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

export interface Preloaded {
  /** Decoded frames in the order given; null for one that could not be loaded. */
  bitmaps: (ImageBitmap | null)[];
  loaded: number;
  total: number;
  done: boolean;
}

const NONE: Preloaded = { bitmaps: [], loaded: 0, total: 0, done: true };

/**
 * Decodes every frame to an `ImageBitmap` before it is needed, a few at a time, so playback never
 * waits on the network or on decoding. The bitmaps are released when the frames change.
 */
export function usePreloadedFrames(frames: readonly TwinFrame[]): Preloaded {
  const [state, setState] = useState<Preloaded>(NONE);
  useEffect(() => {
    if (frames.length === 0) {
      setState(NONE);
      return;
    }
    const controller = new AbortController();
    const bitmaps: (ImageBitmap | null)[] = new Array(frames.length).fill(null);
    let loaded = 0;
    let next = 0;
    setState({ bitmaps, loaded: 0, total: frames.length, done: false });
    const worker = async () => {
      while (!controller.signal.aborted) {
        const i = next++;
        const frame = frames[i];
        if (!frame) return;
        bitmaps[i] = await decode(frame, controller.signal);
        if (controller.signal.aborted) {
          bitmaps[i]?.close();
          return;
        }
        loaded++;
        setState({ bitmaps, loaded, total: frames.length, done: loaded === frames.length });
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, frames.length) }, worker));
    return () => {
      controller.abort();
      for (const bitmap of bitmaps) bitmap?.close();
    };
  }, [frames]);
  return state;
}
