import type { CanonicalSeries, FieldBundle } from "@itza/engine/contracts";
import type { NdviSource } from "@itza/engine/memory";

/** The bundle's NDVI series in the shape Field Memory reads; HLS where the source says so, else MODIS. */
export function ndviSources(bundle: Pick<FieldBundle, "series">): NdviSource[] {
  return bundle.series
    .filter((s) => s.var === "ndvi" && s.cadence !== "static")
    .map((s) => ({
      sensor: s.provenance.source.toLowerCase().includes("hls")
        ? ("hls" as const)
        : ("modis" as const),
      cadence: s.cadence,
      start: s.start,
      values: s.values,
      quality: s.quality,
    }));
}

/** The NDVI series that sets the provenance chip: the finest resolution among them. */
export function primaryNdvi(bundle: Pick<FieldBundle, "series">): CanonicalSeries | undefined {
  return bundle.series
    .filter((s) => s.var === "ndvi" && s.cadence !== "static")
    .sort((a, b) => a.provenance.resolution_m - b.provenance.resolution_m)[0];
}
