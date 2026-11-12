import type { Layer } from "@deck.gl/core";
import type { FieldBundle } from "@itza/engine/contracts";
import { lazy, Suspense, useCallback, useState } from "react";
import { t } from "../copy";
import { areaHa, centroid, type FieldGeometry } from "../data/geometry";
import { formatDegrees, formatHectares } from "../lib/format";
import { FlatField } from "./FlatField";
import { hasWebGL2 } from "./webgl";

// MapLibre terrain and deck.gl load only when the browser can use them.
const Twin3D = lazy(() => import("./Twin3D"));

export interface FieldTwinProps {
  geometry: FieldGeometry;
  /** Optional: only its area is shown, so the view works before the data features land. */
  bundle?: FieldBundle;
  /** Extra deck.gl layers for the 3D view (draped data is added through this). */
  layers?: Layer[];
}

export function FieldTwin({ geometry, bundle, layers }: FieldTwinProps) {
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  const [lon, lat] = centroid(geometry);
  const summary = t("twin.summary")
    .replace("{area}", formatHectares(bundle?.field.area_ha ?? areaHa(geometry)))
    .replace("{lat}", formatDegrees(lat, "N", "S"))
    .replace("{lon}", formatDegrees(lon, "E", "W"));
  const threeD = hasWebGL2() && !failed;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <p className="text-body text-ink">{summary}</p>
      <div className="relative min-h-0 flex-1">
        {threeD ? (
          <Suspense fallback={<p className="p-4 text-body text-ink-muted">{t("twin.loading")}</p>}>
            <Twin3D geometry={geometry} onFailure={onFailure} {...(layers ? { layers } : {})} />
          </Suspense>
        ) : (
          <FlatField geometry={geometry} {...(failed ? { notice: t("twin.error") } : {})} />
        )}
      </div>
    </div>
  );
}
