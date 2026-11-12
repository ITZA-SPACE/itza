import type { Provenance } from "@itza/engine/contracts";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useClimate } from "../climate/useClimate";
import { useCompare } from "../compare/useCompare";
import { useFieldStore } from "../state";
import {
  agreement,
  type Flag,
  flagText,
  type Level,
  type Levels,
  MAX_CARD_FLAGS,
  ruleLevel,
  zLevel,
} from "./agreement";
import { arenaInputs, type SeasonInputs } from "./features";
import { fetchStress } from "./service";
import { useArenaStore } from "./store";
import type { Source, StressResponse } from "./types";

export interface ArenaRow extends SeasonInputs {
  /** 1 minus the water-balance score of the current rotation that season; null when not replayed. */
  ruleStress: number | null;
  ml: StressResponse | null;
  mlStatus: "pending" | "ready" | "unavailable" | "no-weather";
  levels: Levels;
  score: number | null;
  flags: Flag[];
}

export type ArenaStatus = "no-field" | "loading" | "no-data" | "ready";

export interface ArenaState {
  status: ArenaStatus;
  rows: ArenaRow[];
  /** The season the comparison found hardest, where the Arena opens. */
  worstSeason: string | null;
  /** Mean agreement over the seasons that have at least two opinions. */
  meanScore: number | null;
  /** Where the rule engine's weather and the satellite opinion come from, for the provenance chips. */
  sources: { weather: Provenance | null; ndvi: Provenance | null; smap: Provenance | null };
}

/** The three opinions of every usable season of the selected field, with their agreement and flags. */
export function useArena(): ArenaState {
  const { status: climateStatus, bundle, fingerprint } = useClimate();
  const compare = useCompare();
  const geometry = useFieldStore((s) => s.field?.geometry);

  const inputs = useMemo(
    () => (bundle && fingerprint ? arenaInputs(bundle, fingerprint) : null),
    [bundle, fingerprint],
  );
  const provenance = useMemo<Source[]>(() => {
    const p = inputs?.forcing.provenance;
    return p
      ? [
          {
            source: p.derived_from?.join(", ") || p.source,
            resolution: `${p.resolution_m} m`,
            period: `${p.period.start} to ${p.period.end}`,
          },
        ]
      : [];
  }, [inputs]);

  const stress = useQueries({
    queries: (inputs?.seasons ?? []).map((s) => ({
      queryKey: ["arena-ml", s.label, s.features, provenance],
      enabled: s.features !== null,
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchStress(s.features as NonNullable<typeof s.features>, provenance, signal),
    })),
  });

  const output = compare.view?.output;
  const rule = output
    ? (output.results.find((r) => r.rotation_id === compare.view?.baselineId) ?? output.results[0])
    : undefined;

  const rows: ArenaRow[] = (inputs?.seasons ?? []).map((s, i) => {
    const query = stress[i];
    const ml = query?.data ?? null;
    const water = rule?.seasons.find((x) => x.season === s.label)?.criteria.water_balance;
    const ruleStress = water === undefined ? null : 1 - water;
    const levels: Levels = {};
    if (ruleStress !== null) levels.rule = ruleLevel(ruleStress);
    if (ml) levels.ml = zLevel(ml.prediction);
    if (s.ndviZ !== null) levels.sat = zLevel(s.ndviZ);
    const a = agreement(s.label, levels);
    return {
      ...s,
      ruleStress,
      ml,
      mlStatus: ml
        ? "ready"
        : s.features === null
          ? "no-weather"
          : query?.isError
            ? "unavailable"
            : "pending",
      levels,
      score: a.score,
      flags: a.flags,
    };
  });

  // Recent seasons first; the comparison adds these notes to the risks of its evidence cards.
  const notesKey = JSON.stringify(
    rows
      .flatMap((r) => r.flags)
      .sort((a, b) => b.season.localeCompare(a.season))
      .slice(0, MAX_CARD_FLAGS)
      .map(flagText),
  );
  const set = useArenaStore((s) => s.set);
  const fieldKey = geometry ? JSON.stringify(geometry) : null;
  const settled = stress.every((q) => !q.isPending || q.fetchStatus === "idle");
  useEffect(() => {
    if (fieldKey && settled && compare.status === "ready")
      set(fieldKey, JSON.parse(notesKey) as string[]);
  }, [fieldKey, settled, compare.status, notesKey, set]);

  const scores = rows.map((r) => r.score).filter((v): v is number => v !== null);
  const status: ArenaStatus =
    climateStatus === "no-field"
      ? "no-field"
      : climateStatus === "no-data" || (inputs && inputs.seasons.length === 0)
        ? "no-data"
        : climateStatus === "loading" || (compare.status !== "ready" && compare.status !== "error")
          ? "loading"
          : "ready";
  return {
    status,
    rows,
    worstSeason: compare.view?.worstSeason ?? null,
    meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    sources: {
      weather: inputs?.forcing.provenance ?? null,
      ndvi: inputs?.ndvi?.provenance ?? null,
      smap: bundle?.series.find((x) => x.var === "sm_rootzone")?.provenance ?? null,
    },
  };
}

export type { Level };
