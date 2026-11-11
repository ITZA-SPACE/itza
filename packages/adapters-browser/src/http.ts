export type HttpResult =
  | { ok: true; data: unknown; headers: Headers }
  | { ok: false; reason: string; status?: number };

export interface HttpOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  /** Extra attempts after the first one. */
  retries?: number;
  baseDelayMs?: number;
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function errorName(error: unknown): string {
  return typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "Error";
}

/** GET JSON with a per-attempt timeout, caller cancellation, and retry with exponential backoff. Never throws. */
export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly baseDelayMs: number;

  constructor(options: HttpOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.sleep = options.sleep ?? defaultSleep;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.retries = options.retries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 500;
  }

  async getJson(url: string, signal?: AbortSignal): Promise<HttpResult> {
    let reason = "no attempt made";
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (signal?.aborted) return { ok: false, reason: "request cancelled" };
      if (attempt > 0) await this.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      const attemptSignal = AbortSignal.any([
        AbortSignal.timeout(this.timeoutMs),
        ...(signal ? [signal] : []),
      ]);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          signal: attemptSignal,
          headers: { Accept: "application/json" },
        });
      } catch (error) {
        if (signal?.aborted) return { ok: false, reason: "request cancelled" };
        reason =
          errorName(error) === "TimeoutError"
            ? `timed out after ${this.timeoutMs} ms`
            : "network error";
        continue;
      }
      if (RETRY_STATUS.has(response.status)) {
        reason = `HTTP ${response.status}`;
        continue;
      }
      if (!response.ok) {
        return { ok: false, reason: `HTTP ${response.status}`, status: response.status };
      }
      try {
        return { ok: true, data: await response.json(), headers: response.headers };
      } catch {
        return { ok: false, reason: "response was not valid JSON" };
      }
    }
    return { ok: false, reason: `${reason} after ${this.retries + 1} attempts` };
  }
}
