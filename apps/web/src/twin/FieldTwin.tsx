import type { Layer } from "@deck.gl/core";
import type { FieldBundle } from "@itza/engine/contracts";
import type { Map as MapLibreMap } from "maplibre-gl";
import { lazy, Suspense, useCallback, useState } from "react";
import { t } from "../copy";
import { areaHa, centroid, type FieldGeometry } from "../data/geometry";
import { fmt, formatDegrees, formatHectares } from "../lib/format";
import { FlatField } from "./FlatField";
import { OverlayPanel } from "./OverlayPanel";
import type { OverlayId } from "./overlays";
import { Timelapse } from "./Timelapse";
import { useTwinData } from "./useTwinData";
import { hasWebGL2 } from "./webgl";

// MapLibre terrain and deck.gl load only when the browser can use them.
const Twin3D = lazy(() => import("./Twin3D"));

export interface FieldTwinProps {
  geometry: FieldGeometry;
  /** Optional: only its area is shown, so the view works before the data features land. */
  bundle?: FieldBundle;
  /** Extra deck.gl layers for the 3D view. */
  layers?: Layer[];
}

export function FieldTwin({ geometry, bundle, layers }: FieldTwinProps) {
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const data = useTwinData(geometry);
  const [view, setView] = useState({ index: 0, moisture: false });
  const [overlays, setOverlays] = useState<Record<OverlayId, boolean>>({
    flow: false,
    slope: false,
    frost: false,
    zones: false,
  });
  const [lon, lat] = centroid(geometry);
  const field = bundle ?? data.bundle;
  const summary = t("twin.summary")
    .replace("{area}", formatHectares(field?.field.area_ha ?? areaHa(geometry)))
    .replace("{lat}", formatDegrees(lat, "N", "S"))
    .replace("{lon}", formatDegrees(lon, "E", "W"));
  const threeD = hasWebGL2() && !failed;
  const frames = data.frames.data;
  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only">{summary}</p>
      <div className="relative h-[65vh] min-h-[24rem] overflow-hidden rounded-card border border-rim-card bg-night shadow-glass-card">
        {threeD ? (
          <Suspense fallback={<p className="p-4 text-body text-ink-muted">{t("twin.loading")}</p>}>
            <Twin3D
              geometry={geometry}
              onFailure={onFailure}
              onMap={setMap}
              {...(layers ? { layers } : {})}
            />
          </Suspense>
        ) : (
          <FlatField
            geometry={geometry}
            {...(failed ? { notice: t("twin.error") } : {})}
            {...(frames
              ? {
                  layers: {
                    frames,
                    index: view.index,
                    moisture: view.moisture,
                    overlays,
                    terrain: data.terrain.data,
                    zones: data.zones.data,
                  },
                }
              : {})}
          />
        )}
      </div>
      {frames && frames.ndvi.length > 0 ? (
        <Timelapse map={threeD ? map : null} frames={frames} onView={setView} />
      ) : data.frames.isError ? (
        <p role="status" className="text-caption text-ink-muted">
          {fmt(t("twin.lapse.error"), { message: data.frames.error.message })}
        </p>
      ) : data.frames.isSuccess ? (
        <p role="status" className="text-caption text-ink-muted">
          {t("twin.lapse.none")}
        </p>
      ) : null}
      <OverlayPanel
        map={threeD ? map : null}
        terrain={data.terrain.data}
        zones={data.zones.data}
        loading={data.terrain.isLoading || data.zones.isLoading}
        onChange={setOverlays}
      />
    </div>
  );
}
