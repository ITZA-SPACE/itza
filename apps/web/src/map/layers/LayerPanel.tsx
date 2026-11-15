import {
  Disclosure,
  ProvenanceChip,
  Select,
  Slider,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@itza/ui-kit";
import { CloudRain, Droplets, Layers, Leaf, Mountain, Shovel, Snowflake, Sun } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { t } from "../../copy";
import { MapTool } from "../MapTool";
import { TimelineScrubber } from "../timeline";
import { labelFor, periodStarts } from "../timeline/periods";
import type { FootprintKind } from "./footprints";
import { type CompareMode, useLayerState } from "./layerStore";
import { FOOTPRINT_COLORS } from "./overlay";
import { type LayerDef, listLayers } from "./registry";
import { type Side, useLayers } from "./useLayers";

const COMPARE_COPY = {
  off: "compare.off",
  dates: "compare.dates",
  layers: "compare.layers",
} as const;
const KINDS: FootprintKind[] = ["smap", "power", "modis"];
const MODES: CompareMode[] = ["off", "dates", "layers"];
const labels = {
  source: t("map.field.provenance.label.source"),
  resolution: t("map.field.provenance.label.resolution"),
  period: t("map.field.provenance.label.period"),
};

function valueText(def: LayerDef, value: number): string {
  const n = new Intl.NumberFormat("en", {
    maximumFractionDigits: 2,
    signDisplay: def.colors.length === 3 ? "exceptZero" : "auto",
  }).format(value);
  return t(def.valueKey).replace("{n}", n);
}

function Reading({ side, gap }: { side: Side; gap: string | undefined }) {
  if (!side.reading)
    return <p className="text-caption text-ink-muted">{gap ?? t("layers.unavailable")}</p>;
  const { provenance } = side.reading;
  return (
    <div className="flex items-center gap-2">
      <span className="font-display text-title font-bold text-ink tabular-nums">
        {valueText(side.def, side.reading.value)}
      </span>
      <ProvenanceChip {...provenance} labels={labels} compact />
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  ndvi: <Leaf aria-hidden />,
  "soil-moisture": <Droplets aria-hidden />,
  rainfall: <CloudRain aria-hidden />,
  "heat-days": <Sun aria-hidden />,
  "frost-days": <Snowflake aria-hidden />,
  "bare-soil": <Shovel aria-hidden />,
  slope: <Mountain aria-hidden />,
};

/**
 * The map's data layers as one row of icons. None is on at first, so the satellite picture shows
 * the land itself; picking one paints the field and gives its reading in one line. The timeline,
 * the compare slider and the pixel footprints appear only with a layer, one fold deep.
 */
export function LayerPanel() {
  const { bundle, bounds, a, b, granularity, date } = useLayers();
  const state = useLayerState();
  const setShown = useLayerState((s) => s.setShown);
  const [on, setOn] = useState(false);
  useEffect(() => {
    setShown(on);
    return () => setShown(false);
  }, [on, setShown]);
  const all = listLayers();
  if (!bundle || !bounds || !a) return null;
  const gapFor = (def: LayerDef) => bundle.gaps.find((g) => g.var === def.gapVar)?.reason;
  const starts = periodStarts(bounds, granularity);
  const dateBIndex = Math.max(0, starts.indexOf(b?.period.start ?? ""));
  return (
    <div className="space-y-3">
      <fieldset className="m-0 flex items-center justify-between border-0 p-0">
        <legend className="sr-only">{t("layers.choose")}</legend>
        {all.map((def) => (
          <MapTool
            key={def.id}
            side="top"
            label={t(def.labelKey)}
            hint={t(def.captionKey)}
            icon={ICONS[def.id] ?? <Layers aria-hidden />}
            pressed={on && def.id === a.def.id}
            onClick={() => {
              if (on && def.id === a.def.id) setOn(false);
              else {
                state.setActive(def.id);
                setOn(true);
              }
            }}
          />
        ))}
      </fieldset>
      {on ? (
        <>
          <div className="flex items-end justify-between gap-3 rounded-panel border border-line-soft bg-glass px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-caption font-semibold text-ink-muted">
                {t(a.def.labelKey)}
              </p>
              <p className="text-caption text-subtle">
                {labelFor(date ?? bounds.end, granularity)}
              </p>
            </div>
            <Reading side={a} gap={gapFor(a.def)} />
          </div>
          <TimelineScrubber bounds={bounds} />
          <Disclosure summary={t("layers.more")}>
            <div className="space-y-5 pt-1">
              <section aria-labelledby="compare-title" className="space-y-2">
                <h3 id="compare-title" className="text-body font-semibold text-ink">
                  {t("compare.title")}
                </h3>
                <Tabs
                  value={state.compare}
                  onValueChange={(m) => state.setCompare(m as typeof state.compare)}
                >
                  <TabsList aria-label={t("compare.mode")}>
                    {MODES.map((m) => (
                      <TabsTrigger key={m} value={m}>
                        {t(COMPARE_COPY[m])}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {state.compare === "dates" ? (
                  <Slider
                    min={0}
                    max={Math.max(0, starts.length - 1)}
                    step={1}
                    value={[dateBIndex]}
                    onValueChange={([i]) => {
                      const next = starts[i ?? 0];
                      if (next) state.setDateB(next);
                    }}
                    thumbLabels={[t("compare.dateThumb")]}
                  />
                ) : null}
                {state.compare === "layers" ? (
                  <Select
                    aria-label={t("compare.layerSelect")}
                    className="w-full"
                    value={b?.def.id ?? ""}
                    onChange={(e) => state.setLayerB(e.target.value)}
                  >
                    {all
                      .filter((l) => l.id !== a.def.id)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {t(l.labelKey)}
                        </option>
                      ))}
                  </Select>
                ) : null}
                {b ? (
                  <>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round(state.split * 100)]}
                      onValueChange={([v]) => state.setSplit((v ?? 50) / 100)}
                      thumbLabels={[t("compare.divider")]}
                    />
                    <div className="grid grid-cols-2 gap-3 text-caption">
                      <div>
                        <p className="font-semibold text-ink">
                          {t("compare.west")}: {a.def.id === b.def.id ? a.label : t(a.def.labelKey)}
                        </p>
                        <Reading side={a} gap={gapFor(a.def)} />
                      </div>
                      <div>
                        <p className="font-semibold text-ink">
                          {t("compare.east")}: {a.def.id === b.def.id ? b.label : t(b.def.labelKey)}
                        </p>
                        <Reading side={b} gap={gapFor(b.def)} />
                      </div>
                    </div>
                  </>
                ) : null}
              </section>

              <section aria-labelledby="footprints-title" className="space-y-2">
                <h3 id="footprints-title" className="text-body font-semibold text-ink">
                  {t("footprints.title")}
                </h3>
                <fieldset className="space-y-2 border-0 p-0">
                  <legend className="sr-only">{t("footprints.title")}</legend>
                  {KINDS.map((k) => (
                    <div key={k} className="flex items-center gap-2">
                      <label className="flex min-h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-caption text-ink">
                        <input
                          type="checkbox"
                          checked={state.footprints[k]}
                          onChange={(e) => state.setFootprint(k, e.target.checked)}
                        />
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: FOOTPRINT_COLORS[k] }}
                        />
                        <span className="truncate">{t(`footprints.${k}`)}</span>
                      </label>
                      <ProvenanceChip
                        compact
                        source={t(`footprints.${k}.source`)}
                        resolution={t(`footprints.${k}.resolution`)}
                        period={t("footprints.period")}
                        labels={labels}
                      />
                    </div>
                  ))}
                </fieldset>
              </section>
            </div>
          </Disclosure>
        </>
      ) : null}
    </div>
  );
}
