import type { CanonicalSeries, Gap } from "@itza/engine/contracts";
import type { FieldGeometry } from "./geometry";
import type { Period } from "./types";

/** The science API caps a bundle request at 5 years. */
export const SERVER_MAX_DAYS = 5 * 365;
/** Canonical variables served by the science API adapters (IMERG, SMAP L4, HLS VI). */
export const SERVER_VARS = ["precip", "sm_surface", "sm_rootzone", "ndvi"] as const;

export interface ScienceDeps {
  baseUrl: string;
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  /** Give up polling after this long. */
  timeoutMs: number;
}

export interface ServerResult {
  series: CanonicalSeries[];
  gaps: Gap[];
}

interface BundleStatus {
  status: "queued" | "running" | "done" | "error";
  error?: string | null;
  gaps?: Gap[] | null;
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

function isSeries(value: unknown): value is CanonicalSeries {
  return (
    typeof value === "object" &&
    value !== null &&
    "var" in value &&
    "values" in value &&
    "provenance" in value &&
    Array.isArray((value as { values: unknown }).values)
  );
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

    const fetched = await Promise.all(
      SERVER_VARS.map(async (variable) => {
        const response = await deps.fetch(
          `${base}/v1/bundles/${accepted.id}/series/${variable}`,
          init(),
        );
        if (response.status === 404) return undefined;
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${variable}`);
        const body = await readJson(response);
        return isSeries(body) ? body : undefined;
      }),
    );
    return {
      series: fetched.filter((s): s is CanonicalSeries => s !== undefined),
      gaps: (status.gaps ?? []).filter((g) => g.var !== "elevation"),
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
