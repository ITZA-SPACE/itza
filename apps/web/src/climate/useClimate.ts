import { type ClimateFingerprint, climateFingerprint } from "@itza/engine/climate";
import type { FieldBundle } from "@itza/engine/contracts";
import { useMemo } from "react";
import { useFieldBundle } from "../data";
import { useSettled } from "../lib/useSettled";
import { regionFor } from "../memory/region";
import { useFieldStore } from "../state";

const SETTLE_MS = 800;

export type ClimateStatus = "no-field" | "loading" | "no-data" | "ready";

export interface ClimateState {
  status: ClimateStatus;
  bundle: FieldBundle | undefined;
  fingerprint: ClimateFingerprint | null;
}

/** The Climate Fingerprint of the selected field, from its bundle, with the region's calendar. */
export function useClimate(): ClimateState {
  const centroid = useFieldStore((s) => s.field?.centroid);
  const geometry = useSettled(
    useFieldStore((s) => s.field?.geometry),
    SETTLE_MS,
  );
  const { bundle, isComplete } = useFieldBundle(geometry);
  const lon = centroid?.[0];
  const lat = centroid?.[1];
  const fingerprint = useMemo(() => {
    if (!bundle || lon === undefined || lat === undefined) return null;
    try {
      const yearStartMonth = regionFor(lon, lat).calendar.agriculturalYearStartMonth;
      const result = climateFingerprint(bundle, { yearStartMonth });
      return result.seasons.some((s) => s.usable) ? result : null;
    } catch {
      // Weather series missing or not overlapping: shown as "no data", not as a crash.
      return null;
    }
  }, [bundle, lon, lat]);

  const status: ClimateStatus =
    geometry === undefined
      ? "no-field"
      : !bundle || (!isComplete && !fingerprint)
        ? "loading"
        : fingerprint
          ? "ready"
          : "no-data";
  return { status, bundle, fingerprint };
}
