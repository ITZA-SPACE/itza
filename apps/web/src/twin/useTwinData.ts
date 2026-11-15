import type { FieldBundle } from "@itza/engine/contracts";
import { useQuery } from "@tanstack/react-query";
import { heroIdFor, heroStatic, useFieldBundle } from "../data";
import type { FieldGeometry } from "../data/geometry";
import { coverage } from "../map/layers/series";
import { fetchZones, parseZones } from "../zones/service";
import { fetchFrames, frameIndexUrl } from "./frames";
import { fetchRelief } from "./relief/reliefData";
import { fetchTerrain, terrainUrl } from "./terrainData";

/** `/v1/zones` accepts at most 1825 days, so zones use the latest five years of the record. */
const ZONE_DAYS = 1825;

export function period(bundle: FieldBundle): { start: string; end: string } {
  const series = bundle.series.find((s) => s.var === "ndvi") ?? bundle.series[0];
  const { start, end } = series
    ? coverage(series)
    : { start: "2015-01-01", end: new Date().toISOString().slice(0, 10) };
  const earliest = Date.parse(`${end}T00:00:00Z`) - (ZONE_DAYS - 1) * 86_400_000;
  const first = Math.max(Date.parse(`${start}T00:00:00Z`), earliest);
  return { start: new Date(first).toISOString().slice(0, 10), end };
}

/**
 * What the twin drapes and overlays for a field: dated NDVI and moisture frames, terrain products and
 * management zones, each loading on its own so one that is missing never blocks the others.
 */
export function useTwinData(geometry: FieldGeometry) {
  const { bundle } = useFieldBundle(geometry);
  const heroId = heroIdFor(geometry);
  const framesUrl = bundle ? frameIndexUrl(bundle, heroId) : null;
  const terrainIndexUrl = bundle ? terrainUrl(bundle, heroId) : null;
  const common = {
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    networkMode: "offlineFirst",
  } as const;

  const frames = useQuery({
    ...common,
    queryKey: ["twin-frames", framesUrl],
    enabled: framesUrl !== null,
    queryFn: ({ signal }) => fetchFrames(framesUrl as string, signal),
  });
  const terrain = useQuery({
    ...common,
    queryKey: ["twin-terrain", terrainIndexUrl],
    enabled: terrainIndexUrl !== null,
    queryFn: ({ signal }) => fetchTerrain(terrainIndexUrl as string, signal),
  });
  const zones = useQuery({
    ...common,
    queryKey: ["twin-zones", bundle?.field.id ?? null],
    enabled: bundle !== undefined,
    queryFn: async ({ signal }) => {
      // A hero field's zones are precomputed, so they work offline (as in `useZones`).
      const precomputed = parseZones(await heroStatic(geometry, "zones.json", signal));
      return (
        precomputed ?? fetchZones(bundle as FieldBundle, period(bundle as FieldBundle), signal)
      );
    },
  });
  // A hero field ships its relief in its terrain file. Any other field asks the science API with
  // its outline alone, so the 3D surface never waits for the bundle to be built.
  const relief = useQuery({
    ...common,
    queryKey: ["twin-relief", heroId ?? JSON.stringify(geometry.coordinates)],
    enabled: heroId === undefined,
    queryFn: ({ signal }) => fetchRelief(geometry, signal),
  });
  return { bundle, frames, terrain, zones, relief, hero: heroId !== undefined };
}
