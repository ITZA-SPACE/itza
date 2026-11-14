import { ProvenanceChip, Toggle } from "@itza/ui-kit";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipLabels } from "../lib/provenance";
import { zoneColor } from "../zones/overlay";
import type { ZoneCollection } from "../zones/types";
import type { DataSource } from "./frames";
import {
  ensureOverlays,
  FROST_COLORS,
  OVERLAYS,
  type OverlayId,
  removeOverlays,
  SLOPE_COLORS,
  setOverlayVisible,
} from "./overlays";
import type { TerrainProducts } from "./terrainData";

const month = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });
const monthOf = (iso: string) => month.format(new Date(`${iso}T00:00:00Z`));

function chip(source: DataSource) {
  return (
    <ProvenanceChip
      source={source.product}
      resolution={`${source.resolutionM} m`}
      period={`${monthOf(source.period.start)} – ${monthOf(source.period.end)}`}
      labels={chipLabels()}
      {...(source.method ? { detail: source.method } : {})}
    />
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2 text-caption text-ink">
      <span
        aria-hidden="true"
        className="size-3 rounded-sm border border-ink/30"
        style={{ background: color }}
      />
      {label}
    </li>
  );
}

interface Row {
  id: OverlayId;
  available: boolean;
  reason: string | null;
  source: DataSource | null;
  legend: React.ReactNode;
}

/** The terrain and zone overlays of the twin, each with a toggle, a caption and where its data comes from. */
export function OverlayPanel({
  map,
  terrain,
  zones,
  loading,
  onChange,
}: {
  map: MapLibreMap | null;
  terrain: TerrainProducts | undefined;
  zones: ZoneCollection | undefined;
  loading: boolean;
  onChange?: (on: Record<OverlayId, boolean>) => void;
}) {
  const [on, setOn] = useState<Record<OverlayId, boolean>>({
    flow: false,
    slope: false,
    frost: false,
    zones: false,
  });

  useEffect(() => {
    if (!map) return;
    ensureOverlays(map, { terrain, zones });
    for (const id of OVERLAYS) setOverlayVisible(map, id, on[id]);
  }, [map, terrain, zones, on]);

  useEffect(() => {
    onChange?.(on);
  }, [on, onChange]);

  useEffect(() => {
    if (!map) return;
    return () => removeOverlays(map);
  }, [map]);

  const terrainReason = terrain?.gaps[0]?.reason ?? null;
  const terrainOk = terrain?.available === true && terrain.displayBounds !== null;
  const zoneSource = zones?.provenance[0];
  const rows: Row[] = [
    {
      id: "flow",
      available: terrainOk && terrain.flowLines.features.length > 0,
      reason: terrainReason,
      source: terrain?.source ?? null,
      legend: null,
    },
    {
      id: "slope",
      available: terrainOk && terrain.images.slope_class !== undefined,
      reason: terrainReason,
      source: terrain?.source ?? null,
      legend: (
        <ul className="space-y-1">
          {SLOPE_COLORS.map((color, i) => (
            <Swatch key={color} color={color} label={t(`twin.overlay.slope.${i}` as never)} />
          ))}
        </ul>
      ),
    },
    {
      id: "frost",
      available: terrainOk && terrain.images.concavity !== undefined,
      reason: terrainReason,
      source: terrain?.source ?? null,
      legend: (
        <ul className="space-y-1">
          <Swatch color={FROST_COLORS.low} label={t("twin.overlay.frost.low")} />
          <Swatch color={FROST_COLORS.high} label={t("twin.overlay.frost.high")} />
        </ul>
      ),
    },
    {
      id: "zones",
      available: zones?.enabled === true && zones.features.length > 0,
      reason: zones?.reason ?? null,
      source: zoneSource
        ? {
            source: zoneSource.source,
            product: zoneSource.product ?? zoneSource.source,
            version: "",
            resolutionM: zoneSource.resolution_m ?? 30,
            period: zoneSource.period ?? { start: "2015-01-01", end: "2025-12-31" },
            method: "",
          }
        : null,
      legend: (
        <ul className="space-y-1">
          {(zones?.features ?? []).map((f) => (
            <Swatch
              key={f.properties.zone}
              color={zoneColor(f.properties.zone)}
              label={fmt(t("twin.overlay.zones.zone"), {
                zone: f.properties.zone,
                area: f.properties.area_ha.toFixed(1),
              })}
            />
          ))}
        </ul>
      ),
    },
  ];

  return (
    <section
      aria-labelledby="twin-overlays-title"
      className="space-y-2 rounded-card bg-surface p-3 shadow-sm"
    >
      <h2 id="twin-overlays-title" className="text-body font-semibold text-ink">
        {t("twin.overlays.title")}
      </h2>
      {loading ? (
        <p role="status" className="text-caption text-ink-muted">
          {t("twin.overlays.loading")}
        </p>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((row) => (
          <li key={row.id} className="space-y-1">
            <Toggle
              pressed={on[row.id] && row.available}
              disabled={!row.available}
              onPressedChange={(pressed) => setOn((s) => ({ ...s, [row.id]: pressed }))}
            >
              {t(`twin.overlay.${row.id}`)}
            </Toggle>
            <p className="text-caption text-ink-muted">{t(`twin.overlay.${row.id}.caption`)}</p>
            {row.available ? (
              <>
                {on[row.id] ? row.legend : null}
                {row.source ? chip(row.source) : null}
              </>
            ) : loading ? null : (
              <p className="text-caption text-ink-muted">
                {fmt(t("twin.overlay.unavailable"), {
                  reason: row.reason ?? t("twin.overlay.unavailable.generic"),
                })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
