import { describe, expect, it, vi } from "vitest";
import { HttpClient } from "../src/http";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function client(fetchImpl: typeof fetch, extra: Record<string, number> = {}) {
  const sleep = vi.fn(async () => {});
  return { http: new HttpClient({ fetch: fetchImpl, sleep, baseDelayMs: 100, ...extra }), sleep };
}

describe("HttpClient", () => {
  it("returns parsed JSON and headers", async () => {
    const { http } = client(async () => json({ a: 1 }));
    const result = await http.getJson("https://x.test");
    expect(result).toMatchObject({ ok: true, data: { a: 1 } });
  });

  it("retries 5xx with exponential backoff and then succeeds", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 503))
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ ok: 1 }));
    const { http, sleep } = client(fetchImpl);
    expect(await http.getJson("https://x.test")).toMatchObject({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200]);
  });

  it("gives a reason after exhausting retries", async () => {
    const { http } = client(async () => json({}, 502));
    expect(await http.getJson("https://x.test")).toEqual({
      ok: false,
      reason: "HTTP 502 after 3 attempts",
    });
  });

  it("does not retry client errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({}, 404));
    const { http } = client(fetchImpl);
    expect(await http.getJson("https://x.test")).toEqual({
      ok: false,
      reason: "HTTP 404",
      status: 404,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports network errors", async () => {
    const { http } = client(async () => {
      throw new TypeError("failed");
    });
    const result = await http.getJson("https://x.test");
    expect(result).toEqual({ ok: false, reason: "network error after 3 attempts" });
  });

  it("times out a hung request", async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const { http } = client(hang, { timeoutMs: 5, retries: 0 });
    expect(await http.getJson("https://x.test")).toEqual({
      ok: false,
      reason: "timed out after 5 ms after 1 attempts",
    });
  });

  it("stops when the caller cancels", async () => {
    const controller = new AbortController();
    const hang: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    const { http } = client(hang, { timeoutMs: 10_000 });
    const pending = http.getJson("https://x.test", controller.signal);
    controller.abort();
    expect(await pending).toEqual({ ok: false, reason: "request cancelled" });
    expect(await http.getJson("https://x.test", controller.signal)).toEqual({
      ok: false,
      reason: "request cancelled",
    });
  });

  it("reports invalid JSON without retrying", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("<html>", { status: 200 }));
    const { http } = client(fetchImpl);
    expect(await http.getJson("https://x.test")).toEqual({
      ok: false,
      reason: "response was not valid JSON",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
