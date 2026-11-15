import { ProvenanceChip } from "@itza/ui-kit";
import { Grid2x2, Mountain, Snowflake, Waves } from "lucide-react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useState } from "react";
import { t } from "../copy";
import { fmt } from "../lib/format";
import { chipLabels } from "../lib/provenance";
import { MapTool } from "../map/MapTool";
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
      compact
      source={source.product}
      resolution={`${source.resolutionM} m`}
      period={`${monthOf(source.period.start)} – ${monthOf(source.period.end)}`}
      labels={chipLabels()}
      {...(source.method ? { detail: source.method } : {})}
    />
  );
}

const OVERLAY_ICONS: Record<OverlayId, React.ReactNode> = {
  flow: <Waves aria-hidden />,
  slope: <Mountain aria-hidden />,
  frost: <Snowflake aria-hidden />,
  zones: <Grid2x2 aria-hidden />,
};

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

  const active = rows.filter((row) => on[row.id] && row.available);
  return (
    <section aria-labelledby="twin-overlays-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="twin-overlays-title" className="text-caption font-semibold text-ink-muted">
          {loading ? t("twin.overlays.loading") : t("twin.overlays.title")}
        </h2>
        <fieldset className="m-0 flex gap-1 border-0 p-0">
          <legend className="sr-only">{t("twin.overlays.title")}</legend>
          {rows.map((row) => (
            <MapTool
              key={row.id}
              side="top"
              label={t(`twin.overlay.${row.id}`)}
              hint={
                row.available || loading
                  ? t(`twin.overlay.${row.id}.caption`)
                  : fmt(t("twin.overlay.unavailable"), {
                      reason: row.reason ?? t("twin.overlay.unavailable.generic"),
                    })
              }
              icon={OVERLAY_ICONS[row.id]}
              pressed={on[row.id] && row.available}
              disabled={!row.available}
              onClick={() => setOn((s) => ({ ...s, [row.id]: !s[row.id] }))}
            />
          ))}
        </fieldset>
      </div>
      {active.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {active.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-2 rounded-panel border border-line-soft bg-glass px-3 py-2"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-caption font-semibold text-ink">{t(`twin.overlay.${row.id}`)}</p>
                {row.legend}
              </div>
              {row.source ? chip(row.source) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
