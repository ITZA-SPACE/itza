import { type CanonicalSeries, type FieldBundle, type Gap, validate } from "@itza/engine/contracts";
import type { FieldGeometry } from "./geometry";
import type { Period } from "./types";

/** The science API caps a bundle request at 5 years. */
export const SERVER_MAX_DAYS = 5 * 365;
/** Canonical variables served by the science API adapters (IMERG, SMAP L4, HLS VI, GLDAS/NLDAS). */
export const SERVER_VARS = ["precip", "sm_surface", "sm_rootzone", "ndvi", "et_actual"] as const;

export interface ScienceDeps {
  baseUrl: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Give up polling after this long. */
  timeoutMs: number;
}

export interface ServerResult {
  series: CanonicalSeries[];
  soil?: FieldBundle["soil"];
  gaps: Gap[];
}

interface BundleStatus {
  status: "queued" | "running" | "done" | "error";
  soil?: unknown;
  error?: string | null;
  gaps?: Gap[] | null;
}

export function parseServerSoil(raw: unknown): FieldBundle["soil"] {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const soil: FieldBundle["soil"] = {};
  for (const [key, item] of Object.entries(raw)) {
    if (typeof item !== "object" || item === null) continue;
    const { value, source, confidence } = item as Record<string, unknown>;
    if (
      typeof value === "number" &&
      Number.isFinite(value) &&
      typeof source === "string" &&
      source.length > 0 &&
      (confidence === "low" || confidence === "medium" || confidence === "high")
    ) {
      soil[key] = { value, source, confidence };
    }
  }
  return soil;
}

function fail(reason: string): ServerResult {
  return { series: [], gaps: SERVER_VARS.map((v) => ({ var: v, reason, severity: "warning" })) };
}

function recentPeriod(period: Period): Period {
  const end = Date.parse(`${period.end}T00:00:00Z`);
  const start = Date.parse(`${period.start}T00:00:00Z`);
  const earliest = end - SERVER_MAX_DAYS * 86_400_000;
  return {
    start: new Date(Math.max(start, earliest)).toISOString().slice(0, 10),
    end: period.end,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function detailOf(body: unknown): string {
  if (typeof body !== "object" || body === null || !("detail" in body)) return "";
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return `: ${detail}`;
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: unknown } | undefined;
    if (typeof first?.msg === "string") return `: ${first.msg}`;
  }
  return "";
}

// Pydantic serializes unset optional fields as null, which the JSON schema rejects; drop them.
// Array items stay as they are: null is a valid missing value inside `values`.
function dropNullFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNullFields);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== null)
      .map(([k, v]) => [k, dropNullFields(v)]),
  );
}

function toSeries(body: unknown): CanonicalSeries | undefined {
  const checked = validate("canonical-series", dropNullFields(body));
  return checked.ok ? checked.data : undefined;
}

/**
 * Builds a bundle on the science API (POST, poll, fetch series). Never throws: any failure becomes
 * gap records so the caller still gets a usable bundle.
 */
export async function fetchServerSeries(
  deps: ScienceDeps,
  geometry: FieldGeometry,
  period: Period,
  signal?: AbortSignal,
): Promise<ServerResult> {
  const base = deps.baseUrl.replace(/\/$/, "");
  const init = (extra: RequestInit = {}): RequestInit => ({
    ...extra,
    signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])]),
  });
  try {
    const created = await deps.fetch(
      `${base}/v1/bundles`,
      init({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geometry,
          period: recentPeriod(period),
          variables: [...SERVER_VARS],
        }),
      }),
    );
    if (!created.ok) {
      return fail(
        `science API refused the field (HTTP ${created.status}${detailOf(await readJson(created))})`,
      );
    }
    const accepted = (await readJson(created)) as { id?: unknown } | undefined;
    if (typeof accepted?.id !== "string")
      return fail("science API returned an unexpected response");

    const deadline = Date.now() + deps.timeoutMs;
    let delay = 1_000;
    let status: BundleStatus | undefined;
    while (Date.now() < deadline) {
      const polled = await deps.fetch(`${base}/v1/bundles/${accepted.id}`, init());
      if (!polled.ok) return fail(`science API status check failed (HTTP ${polled.status})`);
      status = (await readJson(polled)) as BundleStatus;
      if (status.status === "done" || status.status === "error") break;
      await deps.sleep(delay);
      delay = Math.min(delay * 2, 5_000);
    }
    if (status?.status === "error")
      return fail(`science API could not build the bundle: ${status.error ?? "unknown error"}`);
    if (status?.status !== "done") return fail("science API did not finish in time");

    const invalid: string[] = [];
    const fetched = await Promise.all(
      SERVER_VARS.map(async (variable) => {
        const response = await deps.fetch(
          `${base}/v1/bundles/${accepted.id}/series/${variable}`,
          init(),
        );
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${variable}`);
        const series = toSeries(await readJson(response));
        if (!series) invalid.push(variable);
        return series;
      }),
    );
    return {
      series: fetched.filter((s): s is CanonicalSeries => s !== undefined),
      soil: parseServerSoil(status.soil),
      gaps: [
        ...(status.gaps ?? []).filter((g) => g.var !== "elevation"),
        ...invalid.map((v) => ({
          var: v,
          reason: "science API returned a series that failed validation",
          severity: "warning" as const,
        })),
      ],
    };
  } catch (error) {
    if (signal?.aborted) return { series: [], gaps: [] };
    const name = error instanceof Error ? error.name : "Error";
    return fail(
      name === "TimeoutError"
        ? "science API did not answer in time"
        : "science API is not reachable",
    );
  }
}
