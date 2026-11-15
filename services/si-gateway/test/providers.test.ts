import { describe, expect, it, vi } from "vitest";
import { selectProviders, withFallback } from "../src/providers";
import { failingModel, mockModel, textTurn } from "./helpers";

describe("selectProviders", () => {
  it("orders Gemini before Groq and skips providers without a key", () => {
    const both = selectProviders({ ALLOWED_ORIGINS: "", GEMINI_API_KEY: "g", GROQ_API_KEY: "q" });
    expect(both.map((m) => m.provider.split(".")[0])).toEqual(["google", "groq"]);
    expect(selectProviders({ ALLOWED_ORIGINS: "", GROQ_API_KEY: "q" })).toHaveLength(1);
    expect(selectProviders({ ALLOWED_ORIGINS: "" })).toEqual([]);
  });
});

const callOptions = { prompt: [] } as never;

describe("withFallback", () => {
  it("rejects an empty list", () => {
    expect(() => withFallback([])).toThrow();
  });

  it("uses the primary when it works", async () => {
    const primary = mockModel("a", [textTurn("hi")]);
    const secondary = mockModel("b", [textTurn("no")]);
    await withFallback([primary, secondary]).doStream(callOptions);
    expect(primary.doStreamCalls).toHaveLength(1);
    expect(secondary.doStreamCalls).toHaveLength(0);
  });

  it("falls back on quota errors and logs only name and status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const quota = Object.assign(new Error("quota key=SECRET"), { statusCode: 429 });
    const secondary = mockModel("b", [textTurn("ok")]);
    const model = withFallback([failingModel("a", quota), secondary], { retryDelayMs: 0 });
    expect(model.modelId).toBe("a-model|b-model");
    await model.doStream(callOptions);
    expect(secondary.doStreamCalls).toHaveLength(1);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("provider_fallback");
    expect(logged).toContain("429");
    expect(logged).not.toContain("SECRET");
    warn.mockRestore();
  });

  it("falls back for doGenerate too and throws the last error when all fail", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const model = withFallback([
      failingModel("a", new Error("one")),
      failingModel("b", new Error("two")),
    ]);
    await expect(model.doGenerate(callOptions)).rejects.toThrow("two");
    warn.mockRestore();
  });

  it("does not fall back after the caller aborted", async () => {
    const secondary = mockModel("b", [textTurn("ok")]);
    const controller = new AbortController();
    controller.abort();
    const model = withFallback([failingModel("a", new Error("aborted")), secondary]);
    await expect(
      model.doStream({ prompt: [], abortSignal: controller.signal } as never),
    ).rejects.toThrow("aborted");
    expect(secondary.doStreamCalls).toHaveLength(0);
  });

  it("retries a busy provider once before using the next one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const busy = Object.assign(new Error("overloaded"), { statusCode: 503 });
    let calls = 0;
    const flaky = mockModel("a", [textTurn("recovered")]);
    const original = flaky.doStream.bind(flaky);
    flaky.doStream = async (options) => {
      calls += 1;
      if (calls === 1) throw busy;
      return original(options);
    };
    const secondary = mockModel("b", [textTurn("no")]);
    await withFallback([flaky, secondary], { retryDelayMs: 0 }).doStream(callOptions);
    expect(calls).toBe(2);
    expect(secondary.doStreamCalls).toHaveLength(0);
    warn.mockRestore();
  });

  it("does not retry an error that will not change, and tries the next provider at once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tooBig = Object.assign(new Error("too large"), { statusCode: 413 });
    let calls = 0;
    const primary = failingModel("a", tooBig);
    const original = primary.doStream.bind(primary);
    primary.doStream = async (options) => {
      calls += 1;
      return original(options);
    };
    const secondary = mockModel("b", [textTurn("ok")]);
    await withFallback([primary, secondary], { retryDelayMs: 0 }).doStream(callOptions);
    expect(calls).toBe(1);
    expect(secondary.doStreamCalls).toHaveLength(1);
    warn.mockRestore();
  });

  it("gives up on a provider that stays busy and falls back", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const busy = Object.assign(new Error("overloaded"), { statusCode: 503 });
    const secondary = mockModel("b", [textTurn("ok")]);
    await withFallback([failingModel("a", busy), secondary], { retryDelayMs: 0 }).doStream(
      callOptions,
    );
    expect(secondary.doStreamCalls).toHaveLength(1);
    warn.mockRestore();
  });

  it("gives up on a provider that never starts answering and uses the next one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hung = mockModel("a", [textTurn("never")]);
    hung.doStream = (options) =>
      new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const secondary = mockModel("b", [textTurn("ok")]);
    await withFallback([hung, secondary], { retryDelayMs: 0, attemptTimeoutMs: 20 }).doStream(
      callOptions,
    );
    expect(secondary.doStreamCalls).toHaveLength(1);
    warn.mockRestore();
  });

  it("does not use the next provider when the caller itself cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const primary = failingModel("a", new Error("cancelled"));
    const secondary = mockModel("b", [textTurn("no")]);
    await expect(
      withFallback([primary, secondary]).doStream({
        prompt: [],
        abortSignal: controller.signal,
      } as never),
    ).rejects.toThrow("cancelled");
    expect(secondary.doStreamCalls).toHaveLength(0);
  });
});
