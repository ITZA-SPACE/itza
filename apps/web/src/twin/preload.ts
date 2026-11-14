import { useEffect, useState } from "react";
import type { TwinFrame } from "./frames";

const CONCURRENCY = 6;
/** Frames are decoded at most this many pixels on a side: a hundred 1024-pixel bitmaps would not fit in memory. */
export const MAX_SIDE = 512;

/** The size a frame is decoded and drawn at. */
export function decodedSize(width: number, height: number): { width: number; height: number } {
  const k = Math.min(1, MAX_SIDE / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** Fetches and decodes a frame; null when the frame is missing or will not decode. */
async function decode(frame: TwinFrame, signal: AbortSignal): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(frame.url, { signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (frame.width > 0 && frame.height > 0 && Math.max(frame.width, frame.height) > MAX_SIDE) {
      const { width, height } = decodedSize(frame.width, frame.height);
      return await createImageBitmap(blob, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: "medium",
      });
    }
    return await createImageBitmap(blob);
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
