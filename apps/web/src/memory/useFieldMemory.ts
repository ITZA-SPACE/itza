import type { FieldBundle } from "@itza/engine/contracts";
import { analyseFieldMemory, type FieldMemoryResult } from "@itza/engine/memory";
import { useMemo } from "react";
import { useFieldBundle } from "../data";
import { useSettled } from "../lib/useSettled";
import { useFieldStore } from "../state";
import { ndviSources } from "./ndvi";
import { type Region, regionFor } from "./region";

const SETTLE_MS = 800;

export type MemoryStatus = "no-field" | "loading" | "no-data" | "ready";

export interface FieldMemoryState {
  status: MemoryStatus;
  bundle: FieldBundle | undefined;
  region: Region | null;
  result: FieldMemoryResult | null;
}

/**
 * The selected field's history as Field Memory reads it: seasons, labels, bare windows and the
 * inferred rotation, computed from the bundle's NDVI with the region's calendar and crops.
 */
export function useFieldMemory(): FieldMemoryState {
  const centroid = useFieldStore((s) => s.field?.centroid);
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle, isComplete } = useFieldBundle(geometry);
  const lon = centroid?.[0];
  const lat = centroid?.[1];
  const region = useMemo(
    () => (lon === undefined || lat === undefined ? null : regionFor(lon, lat)),
    [lon, lat],
  );
  const result = useMemo(() => {
    if (!bundle || !region) return null;
    const series = ndviSources(bundle);
    if (series.length === 0) return null;
    return analyseFieldMemory({ series, calendar: region.calendar, crops: region.crops });
  }, [bundle, region]);

  const status: MemoryStatus =
    geometry === undefined
      ? "no-field"
      : !bundle || (!isComplete && !result)
        ? "loading"
        : result && result.seasons.length > 0
          ? "ready"
          : "no-data";
  return { status, bundle, region, result };
}
