/** Per-session and per-IP limits. Counters live in the Worker isolate: best effort, reset on cold start. */
export const LIMITS = {
  sessionRequests: 30,
  sessionTokens: 60_000,
  ipRequestsPerWindow: 20,
  ipWindowMs: 60_000,
  sessionTtlMs: 24 * 60 * 60 * 1000,
  maxBodyBytes: 64 * 1024,
  maxMessages: 40,
  maxOutputTokens: 1_200,
  maxSteps: 6,
  maxEntries: 5_000,
} as const;

export type IpVerdict = { ok: true } | { ok: false; retryAfterSeconds: number };

interface IpWindow {
  start: number;
  count: number;
}
interface SessionUsage {
  start: number;
  requests: number;
  tokens: number;
}

export class Ledger {
  private readonly ips = new Map<string, IpWindow>();
  private readonly sessions = new Map<string, SessionUsage>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Fixed-window rate limit per client IP. */
  checkIp(ip: string): IpVerdict {
    const t = this.now();
    this.evict(this.ips, (w) => t - w.start >= LIMITS.ipWindowMs);
    const w = this.ips.get(ip);
    if (!w || t - w.start >= LIMITS.ipWindowMs) {
      this.ips.set(ip, { start: t, count: 1 });
      return { ok: true };
    }
    if (w.count >= LIMITS.ipRequestsPerWindow) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((w.start + LIMITS.ipWindowMs - t) / 1000)),
      };
    }
    w.count += 1;
    return { ok: true };
  }

  /** Counts one request against the session. Returns false when the request or token budget is spent. */
  admitSession(id: string): boolean {
    const t = this.now();
    this.evict(this.sessions, (s) => t - s.start >= LIMITS.sessionTtlMs);
    let s = this.sessions.get(id);
    if (!s) {
      s = { start: t, requests: 0, tokens: 0 };
      this.sessions.set(id, s);
    }
    if (s.requests >= LIMITS.sessionRequests || s.tokens >= LIMITS.sessionTokens) return false;
    s.requests += 1;
    return true;
  }

  addTokens(id: string, tokens: number): void {
    const s = this.sessions.get(id);
    if (s && Number.isFinite(tokens) && tokens > 0) s.tokens += tokens;
  }

  /** Drops expired entries once the map is large, so a flood of ids cannot grow memory without bound. */
  private evict<T>(map: Map<string, T>, expired: (v: T) => boolean): void {
    if (map.size < LIMITS.maxEntries) return;
    for (const [key, value] of map) if (expired(value)) map.delete(key);
    // Still full of live entries: drop the oldest insertions.
    for (const key of map.keys()) {
      if (map.size < LIMITS.maxEntries) break;
      map.delete(key);
    }
  }
}
