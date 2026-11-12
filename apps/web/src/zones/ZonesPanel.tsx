import { Button, ProvenanceChip } from "@itza/ui-kit";
import { useEffect, useMemo } from "react";
import { t } from "../copy";
import { zoneBacktests } from "./backtest";
import { downloadZones } from "./geojson";
import { zoneColor } from "./overlay";
import { useZoneState, useZones } from "./useZones";

const fmt = (n: number, digits = 2) =>
  new Intl.NumberFormat("en", { maximumFractionDigits: digits }).format(n);
const fill = (text: string, values: Record<string, string>) =>
  Object.entries(values).reduce((s, [k, v]) => s.replace(`{${k}}`, v), text);
const labels = {
  source: t("map.field.provenance.label.source"),
  resolution: t("map.field.provenance.label.resolution"),
  period: t("map.field.provenance.label.period"),
};

/** Management zones for the selected field: stability, notes, same-crop replay and GeoJSON export. */
export function ZonesPanel() {
  const setShown = useZoneState((s) => s.setShown);
  useEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, [setShown]);
  const { bundle, zones, loading, failed } = useZones();

  const backtests = useMemo(() => {
    if (!bundle || !zones?.enabled) return [];
    try {
      return zoneBacktests(bundle, zones.features);
    } catch {
      return []; // the replay needs a full bundle; the zones themselves still show
    }
  }, [bundle, zones]);

  let body: React.ReactNode;
  if (failed) body = <p className="text-caption text-ink-muted">{t("zones.failed")}</p>;
  else if (!zones || loading)
    body = <p className="text-caption text-ink-muted">{t("zones.loading")}</p>;
  else if (!zones.enabled)
    body = (
      <p className="text-caption text-ink-muted">
        {fill(t("zones.disabled"), { reason: zones.reason ?? t("zones.disabled.generic") })}
      </p>
    );
  else {
    const stab = (v: number | null) => (v === null ? t("zones.stability.none") : fmt(v));
    const period = zones.provenance[0]?.period;
    body = (
      <>
        <p className="text-caption text-ink">
          {zones.stability === null
            ? t("zones.stability.none")
            : fill(t("zones.summary"), {
                k: String(zones.features.length),
                stability: fmt(zones.stability),
              })}
        </p>
        <ProvenanceChip
          source={t("zones.source")}
          resolution={fmt(30, 0) + " m"}
          period={period ? fill(t("zones.period"), period) : zones.years.join(", ")}
          labels={labels}
        />
        <ul className="m-0 list-none space-y-2 p-0">
          {zones.features.map((f) => (
            <li
              key={f.properties.zone}
              className="space-y-1 rounded-card border border-line-soft p-2"
            >
              <p className="flex items-center gap-2 text-body font-semibold text-ink">
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ background: zoneColor(f.properties.zone) }}
                />
                {fill(t("zones.zone"), { n: String(f.properties.zone) })}
              </p>
              <p className="text-caption text-ink-muted">
                {fill(t("zones.detail"), {
                  area: fmt(f.properties.area_ha),
                  ndvi: fmt(f.properties.ndvi_mean),
                  stability: stab(f.properties.stability),
                })}
              </p>
              {f.properties.notes.length === 0 ? (
                <p className="text-caption text-ink-muted">{t("zones.noNotes")}</p>
              ) : (
                f.properties.notes.map((n) => (
                  <p key={n} className="text-caption text-ink">
                    {n}
                  </p>
                ))
              )}
            </li>
          ))}
        </ul>
        <p className="text-caption text-ink-muted">
          {fill(t("zones.coverage"), { pct: fmt(zones.coverage * 100, 0) })}
        </p>
        {backtests.length > 0 ? (
          <section aria-labelledby="zones-backtest" className="space-y-1">
            <h3 id="zones-backtest" className="text-body font-semibold text-ink">
              {t("zones.backtest.title")}
            </h3>
            <p className="text-caption text-ink-muted">
              {fill(t("zones.backtest.body"), {
                crop: backtests[0]?.crop.replaceAll("_", " ") ?? "",
              })}
            </p>
            <ul className="m-0 list-none space-y-1 p-0 text-caption text-ink">
              {backtests.map((b) => (
                <li key={b.zone}>
                  {fill(t("zones.backtest.row"), {
                    n: String(b.zone),
                    score: fmt(b.mean * 100, 0),
                    seasons: String(b.seasons.length),
                  })}
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink-muted">{t("zones.backtest.low")}</p>
          </section>
        ) : null}
        <Button onClick={() => downloadZones(zones, "itza-zones.geojson")}>
          {t("zones.export")}
        </Button>
      </>
    );
  }
  return (
    <section aria-labelledby="zones-title" className="space-y-2">
      <h2 id="zones-title" className="text-title font-semibold text-ink">
        {t("zones.title")}
      </h2>
      <p className="text-caption text-ink-muted">{t("zones.intro")}</p>
      {body}
    </section>
  );
}
