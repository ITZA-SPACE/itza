export const SPEEDS = [4, 8, 12] as const;
export type Speed = (typeof SPEEDS)[number];

export interface PlaybackOptions {
  /** Called on every animation frame while playing, and once per seek: frame `a`, fading into `b` by `mix`. */
  onFrame: (a: number, b: number, mix: number) => void;
  /** Called when the whole frame number changes, so the UI can follow without a render per frame. */
  onIndex: (index: number) => void;
  onEnd: () => void;
}

/**
 * A time-lapse clock. `position` moves through the frames at `fps` frames a second; between two
 * frames it reports how far the next one has faded in, so motion looks continuous at 4 to 12 fps.
 * It owns a requestAnimationFrame loop only while playing.
 */
export class Playback {
  position = 0;
  fps: Speed = 8;
  loop = true;
  /** First and last frame index it plays between (inclusive). */
  range: [number, number] = [0, 0];
  private raf = 0;
  private last = 0;
  private lastIndex = -1;
  readonly options: PlaybackOptions;

  constructor(options: PlaybackOptions) {
    this.options = options;
  }

  get playing(): boolean {
    return this.raf !== 0;
  }

  setRange(first: number, last: number): void {
    this.range = [first, Math.max(first, last)];
    this.position = Math.min(Math.max(this.position, first), this.range[1]);
  }

  /** Jumps to a frame and paints it. */
  seek(index: number): void {
    const [first, last] = this.range;
    this.position = Math.min(Math.max(index, first), last);
    this.emit();
  }

  play(): void {
    if (this.playing) return;
    const [first, last] = this.range;
    if (this.position >= last) this.position = first;
    this.last = performance.now();
    const tick = (now: number) => {
      const [lo, hi] = this.range;
      this.position += ((now - this.last) / 1000) * this.fps;
      this.last = now;
      if (this.position >= hi) {
        if (this.loop && hi > lo) {
          this.position = lo + ((this.position - lo) % (hi - lo));
        } else {
          this.position = hi;
          this.emit();
          this.raf = 0;
          this.options.onEnd();
          return;
        }
      }
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.position = Math.round(this.position);
    this.emit();
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private emit(): void {
    const [lo, hi] = this.range;
    const a = Math.min(Math.max(Math.floor(this.position), lo), hi);
    const b = this.loop && a === hi ? lo : Math.min(a + 1, hi);
    this.options.onFrame(a, b, this.position - a);
    if (a !== this.lastIndex) {
      this.lastIndex = a;
      this.options.onIndex(a);
    }
  }
}
