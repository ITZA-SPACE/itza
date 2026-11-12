import { config } from "../lib/config";
import type { Driver, SeasonFeatures, Source, StressResponse } from "./types";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isSource = (v: unknown): v is Source =>
  isObject(v) &&
  typeof v.source === "string" &&
  typeof v.resolution === "string" &&
  typeof v.period === "string";
const isDriver = (v: unknown): v is Driver =>
  isObject(v) &&
  typeof v.feature === "string" &&
  typeof v.shap_value === "number" &&
  (v.value === null || typeof v.value === "number");

/** Typed parsing of an untrusted `/v1/ml/stress` body; null when it is not a stress response. */
export function parseStress(body: unknown): StressResponse | null {
  if (!isObject(body) || typeof body.prediction !== "number") return null;
  const { model } = body;
  if (
    !isObject(model) ||
    typeof model.model_version !== "string" ||
    typeof model.status !== "string" ||
    !Array.isArray(model.provenance) ||
    !model.provenance.every(isSource)
  )
    return null;
  if (!Array.isArray(body.drivers) || !body.drivers.every(isDriver)) return null;
  if (!Array.isArray(body.input_provenance) || !body.input_provenance.every(isSource)) return null;
  return {
    prediction: body.prediction,
    expected_value: typeof body.expected_value === "number" ? body.expected_value : 0,
    drivers: body.drivers,
    model: {
      model_version: model.model_version,
      status: model.status,
      provenance: model.provenance,
      limitations: Array.isArray(model.limitations) ? (model.limitations as string[]) : [],
    },
    input_provenance: body.input_provenance,
    gaps: Array.isArray(body.gaps) ? (body.gaps as string[]) : [],
  };
}

/** The ML model's opinion of one season. Throws on any failure (503 when no trained model is installed). */
export async function fetchStress(
  features: SeasonFeatures,
  provenance: Source[],
  signal?: AbortSignal,
): Promise<StressResponse> {
  const response = await fetch(`${config.scienceApiUrl}/v1/ml/stress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ features, provenance }),
    signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const stress = parseStress(await response.json());
  if (!stress) throw new Error("unexpected response");
  return stress;
}
