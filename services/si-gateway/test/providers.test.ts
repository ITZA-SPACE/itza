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
    const model = withFallback([failingModel("a", quota), secondary]);
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
});
