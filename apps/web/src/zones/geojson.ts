import type { ZoneCollection } from "./types";

/** The collection to download: zones with their notes and stability, plus provenance. */
export function zonesGeoJson(zones: ZoneCollection) {
  return {
    type: "FeatureCollection" as const,
    features: zones.features,
    properties: {
      stability: zones.stability,
      years: zones.years,
      coverage: zones.coverage,
      provenance: zones.provenance,
    },
  };
}

export function downloadZones(zones: ZoneCollection, filename: string): void {
  const blob = new Blob([JSON.stringify(zonesGeoJson(zones), null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
