import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect } from "react";
import { useZoneState, useZones } from "./useZones";

const SRC = "itza-zones";
export const ZONE_COLORS = ["#1b7f5c", "#c2570c", "#2f5fa8", "#8a2d7a"] as const;
export const zoneColor = (zone: number) => ZONE_COLORS[(zone - 1) % ZONE_COLORS.length] as string;

/** Draws the management zones under Terra Draw's layers while the zones panel is open. */
export function useZoneOverlay(map: MapLibreMap | null, ready: boolean): void {
  const { zones } = useZones();
  const shown = useZoneState((s) => s.shown);
  useEffect(() => {
    if (!map || !ready) return;
    if (!map.getSource(SRC)) {
      const before = map.getStyle().layers.find((l) => l.id.startsWith("td-"))?.id;
      map.addSource(SRC, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer(
        {
          id: SRC,
          type: "fill",
          source: SRC,
          paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 },
        },
        before,
      );
    }
    const features =
      shown && zones?.enabled
        ? zones.features.map((f) => ({
            type: "Feature" as const,
            geometry: f.geometry,
            properties: { color: zoneColor(f.properties.zone) },
          }))
        : [];
    (map.getSource(SRC) as { setData: (d: unknown) => void } | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
  }, [map, ready, zones, shown]);
}
