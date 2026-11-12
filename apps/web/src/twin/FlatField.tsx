import { useMemo } from "react";
import { t } from "../copy";
import type { FieldGeometry } from "../data/geometry";
import { boundsOf, ringsOf } from "./bounds";

const SIZE = 400;
const MARGIN = 24;

/** The field outline as an SVG, for browsers that cannot draw the 3D view. Needs no network. */
export function FlatField({ geometry, notice }: { geometry: FieldGeometry; notice?: string }) {
  const { paths, width, height } = useMemo(() => {
    const [w, s, e, n] = boundsOf(geometry);
    const lonScale = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const spanX = Math.max((e - w) * lonScale, 1e-9);
    const spanY = Math.max(n - s, 1e-9);
    const scale = (SIZE - 2 * MARGIN) / Math.max(spanX, spanY);
    return {
      width: spanX * scale + 2 * MARGIN,
      height: spanY * scale + 2 * MARGIN,
      paths: ringsOf(geometry).map(
        (ring) =>
          `${ring
            .map(
              ([lon, lat], i) =>
                `${i ? "L" : "M"}${((lon - w) * lonScale * scale + MARGIN).toFixed(1)} ${((n - lat) * scale + MARGIN).toFixed(1)}`,
            )
            .join(" ")} Z`,
      ),
    };
  }, [geometry]);
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 rounded-card bg-surface-muted p-4 text-center">
      <h2 className="text-title font-semibold text-ink">{t("twin.fallback.title")}</h2>
      <p className="max-w-prose text-body text-ink-muted">{notice ?? t("twin.fallback.body")}</p>
      <svg
        role="img"
        aria-label={t("twin.fallback.outline")}
        viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`}
        className="max-h-80 w-full max-w-sm"
      >
        <path
          d={paths.join(" ")}
          className="fill-accent-soft stroke-accent-strong"
          strokeWidth={3}
          strokeLinejoin="round"
          fillRule="evenodd"
        />
      </svg>
    </div>
  );
}
