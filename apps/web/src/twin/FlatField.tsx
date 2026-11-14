import { useMemo } from "react";
import { t } from "../copy";
import type { FieldGeometry } from "../data/geometry";
import { zoneColor } from "../zones/overlay";
import type { ZoneCollection } from "../zones/types";
import { boundsOf, ringsOf } from "./bounds";
import { type FrameSet, nearestFrame, type TwinFrame } from "./frames";
import type { OverlayId } from "./overlays";
import type { TerrainProducts } from "./terrainData";

const SIZE = 400;
const MARGIN = 24;

export interface FlatLayers {
  frames: FrameSet;
  /** Index of the NDVI frame the time-lapse is on. */
  index: number;
  moisture: boolean;
  overlays: Record<OverlayId, boolean>;
  terrain: TerrainProducts | undefined;
  zones: ZoneCollection | undefined;
}

type Bounds = [west: number, south: number, east: number, north: number];

/**
 * The field outline as an SVG, for browsers that cannot draw the 3D view. It draws the same layers
 * as the twin where it can: the current satellite frame, soil moisture, slope classes, the frost-pocket
 * hint, flow paths and zones.
 */
export function FlatField({
  geometry,
  notice,
  layers,
}: {
  geometry: FieldGeometry;
  notice?: string;
  layers?: FlatLayers;
}) {
  const view = useMemo(() => {
    const [w, s, e, n] = boundsOf(geometry);
    const lonScale = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const spanX = Math.max((e - w) * lonScale, 1e-9);
    const spanY = Math.max(n - s, 1e-9);
    const scale = (SIZE - 2 * MARGIN) / Math.max(spanX, spanY);
    const x = (lon: number) => (lon - w) * lonScale * scale + MARGIN;
    const y = (lat: number) => (n - lat) * scale + MARGIN;
    const place = ([bw, bs, be, bn]: Bounds) => ({
      x: x(bw),
      y: y(bn),
      width: (be - bw) * lonScale * scale,
      height: (bn - bs) * scale,
    });
    const path = (ring: readonly [number, number][]) =>
      `${ring.map(([lon, lat], i) => `${i ? "L" : "M"}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`).join(" ")} Z`;
    return {
      width: spanX * scale + 2 * MARGIN,
      height: spanY * scale + 2 * MARGIN,
      outline: ringsOf(geometry).map(path),
      place,
      path,
      line: (coords: readonly [number, number][]) =>
        coords
          .map(([lon, lat], i) => `${i ? "L" : "M"}${x(lon).toFixed(1)} ${y(lat).toFixed(1)}`)
          .join(" "),
    };
  }, [geometry]);

  const frame: TwinFrame | undefined = layers?.frames.ndvi[layers.index];
  const moisture =
    layers && frame && layers.moisture
      ? layers.frames.moisture[nearestFrame(layers.frames.moisture, frame.date)]
      : undefined;
  const terrain = layers?.terrain?.available ? layers.terrain : undefined;
  const display = terrain?.displayBounds ?? null;

  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-3 rounded-card bg-surface-muted p-4 text-center">
      <h2 className="text-title font-semibold text-ink">{t("twin.fallback.title")}</h2>
      <p className="max-w-prose text-body text-ink-muted">{notice ?? t("twin.fallback.body")}</p>
      <svg
        role="img"
        aria-label={t("twin.fallback.outline")}
        viewBox={`0 0 ${view.width.toFixed(1)} ${view.height.toFixed(1)}`}
        className="max-h-80 w-full max-w-sm"
      >
        <path
          d={view.outline.join(" ")}
          className="fill-accent-soft stroke-accent-strong"
          strokeWidth={3}
          strokeLinejoin="round"
          fillRule="evenodd"
        />
        {frame ? (
          <image
            href={frame.url}
            preserveAspectRatio="none"
            opacity={0.9}
            {...view.place(frame.bounds)}
          />
        ) : null}
        {moisture ? (
          <image
            href={moisture.url}
            preserveAspectRatio="none"
            opacity={0.45}
            {...view.place(moisture.bounds)}
          />
        ) : null}
        {terrain && display && layers?.overlays.slope && terrain.images.slope_class ? (
          <image
            href={terrain.images.slope_class}
            preserveAspectRatio="none"
            opacity={0.6}
            {...view.place(display)}
          />
        ) : null}
        {terrain && display && layers?.overlays.frost && terrain.images.concavity ? (
          <image
            href={terrain.images.concavity}
            preserveAspectRatio="none"
            opacity={0.65}
            {...view.place(display)}
          />
        ) : null}
        {terrain && layers?.overlays.flow
          ? terrain.flowLines.features.map((f) => (
              <path
                key={`${f.geometry.coordinates[0]?.join()}-${f.properties.upstream_cells}`}
                d={view.line(f.geometry.coordinates)}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth={Math.min(3, 0.6 + Math.log10(f.properties.upstream_cells))}
                strokeLinecap="round"
              />
            ))
          : null}
        {layers?.overlays.zones && layers.zones?.enabled
          ? layers.zones.features.map((f) => {
              const rings =
                f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
              return (
                <path
                  key={f.properties.zone}
                  d={rings
                    .flatMap((polygon) =>
                      polygon.map((ring) => view.path(ring as [number, number][])),
                    )
                    .join(" ")}
                  fill={zoneColor(f.properties.zone)}
                  fillOpacity={0.5}
                  stroke={zoneColor(f.properties.zone)}
                  strokeWidth={2}
                  fillRule="evenodd"
                />
              );
            })
          : null}
        <path
          d={view.outline.join(" ")}
          fill="none"
          className="stroke-accent-strong"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
