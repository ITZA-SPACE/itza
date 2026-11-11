import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import type { Env } from "./env";

export type ModelV4 = Extract<LanguageModel, { specificationVersion: "v4" }>;

/** Free-tier defaults: Gemini first, Groq when Gemini fails or is out of quota. */
const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

/** Configured providers in fallback order. A provider without a key is skipped. */
export function selectProviders(env: Env): ModelV4[] {
  const models: ModelV4[] = [];
  if (env.GEMINI_API_KEY) {
    models.push(createGoogle({ apiKey: env.GEMINI_API_KEY })(GEMINI_MODEL) as ModelV4);
  }
  if (env.GROQ_API_KEY) {
    models.push(createGroq({ apiKey: env.GROQ_API_KEY })(GROQ_MODEL) as ModelV4);
  }
  return models;
}

/**
 * One model that tries each provider in order. A provider is skipped when its call fails before
 * any output (quota, auth, 5xx). Only the error name and status are logged, never messages,
 * because provider errors can echo request details.
 */
export function withFallback(models: readonly ModelV4[]): ModelV4 {
  const [primary] = models;
  if (!primary) throw new Error("withFallback needs at least one model");

  async function firstSuccess<T>(
    signal: AbortSignal | undefined,
    call: (model: ModelV4) => PromiseLike<T>,
  ): Promise<T> {
    let last: unknown;
    for (const model of models) {
      try {
        return await call(model);
      } catch (error) {
        if (signal?.aborted) throw error;
        last = error;
        const status = (error as { statusCode?: number }).statusCode;
        console.warn(
          JSON.stringify({
            event: "provider_fallback",
            provider: model.provider,
            error: error instanceof Error ? error.name : "unknown",
            status,
          }),
        );
      }
    }
    throw last;
  }

  return {
    specificationVersion: "v4",
    provider: "itza-fallback",
    modelId: models.map((m) => m.modelId).join("|"),
    supportedUrls: primary.supportedUrls,
    doGenerate: (options) => firstSuccess(options.abortSignal, (m) => m.doGenerate(options)),
    doStream: (options) => firstSuccess(options.abortSignal, (m) => m.doStream(options)),
  };
}
