import { lazy, Suspense, useCallback, useState } from "react";
import { t } from "../copy";
import type { FieldGeometry } from "../data/geometry";
import { useTwinData } from "./useTwinData";
import { hasWebGL2 } from "./webgl";

const ReliefTwin = lazy(() => import("./relief/ReliefTwin"));

/** Fills the frame the map sits in; the toolbar and rain panel of the relief view float inside it. */
const FRAME = "relative min-h-0 flex-1 overflow-hidden rounded-card bg-night";

function Notice({ children }: { children: string }) {
  return (
    <p role="status" className="m-auto max-w-sm px-6 text-center text-body text-ink-muted">
      {children}
    </p>
  );
}

/**
 * The field the map is showing, as a 3D surface in the same frame. A hero field ships its relief
 * with its terrain file; any other field asks the science API with its outline, which builds the
 * package on the first request (up to a minute) and answers from its cache afterwards.
 */
export function MapFrame3D({ geometry }: { geometry: FieldGeometry }) {
  const data = useTwinData(geometry);
  const [failed, setFailed] = useState(false);
  const onFailure = useCallback(() => setFailed(true), []);
  const relief = (data.hero ? data.terrain.data?.relief : data.relief.data) ?? null;
  const loading = data.hero ? data.terrain.isLoading : data.relief.isLoading;
  return (
    <div className="flex h-full flex-col gap-2 p-3 pt-16">
      {!hasWebGL2() || failed ? (
        <Notice>{t("twin.error")}</Notice>
      ) : loading ? (
        <Notice>{t("twin.relief.building")}</Notice>
      ) : relief ? (
        <Suspense fallback={<Notice>{t("twin.loading")}</Notice>}>
          <ReliefTwin
            geometry={geometry}
            relief={relief}
            onFailure={onFailure}
            frameClassName={FRAME}
            fill
          />
        </Suspense>
      ) : (
        <Notice>{t("twin.relief.none")}</Notice>
      )}
    </div>
  );
}
