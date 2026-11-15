import { Disclosure, ProvenanceChip, Select, Slider, Toggle } from "@itza/ui-kit";
import { useEffect } from "react";
import { t } from "../../copy";
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
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-body font-semibold text-ink">
        {valueText(side.def, side.reading.value)}
      </span>
      <ProvenanceChip {...provenance} labels={labels} />
    </div>
  );
}

/** Layer list, timeline, compare slider and pixel footprints for the selected field. */
export function LayerPanel() {
  const { bundle, bounds, a, b, granularity, date } = useLayers();
  const state = useLayerState();
  const setShown = useLayerState((s) => s.setShown);
  useEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, [setShown]);
  const all = listLayers();
  if (!bundle || !bounds || !a)
    return <p className="text-body text-ink-muted">{t("layers.loading")}</p>;
  const gapFor = (def: LayerDef) => bundle.gaps.find((g) => g.var === def.gapVar)?.reason;
  const starts = periodStarts(bounds, granularity);
  const dateBIndex = Math.max(0, starts.indexOf(b?.period.start ?? ""));
  return (
    <div className="space-y-5">
      <section aria-labelledby="layers-title" className="space-y-3">
        <h2 id="layers-title" className="text-title font-semibold text-ink">
          {t("layers.title")}
        </h2>
        <fieldset className="flex flex-wrap gap-2 border-0 p-0">
          <legend className="sr-only">{t("layers.choose")}</legend>
          {all.map((def) => (
            <Toggle
              key={def.id}
              pressed={def.id === a.def.id}
              onPressedChange={(on) => on && state.setActive(def.id)}
              className="min-h-9 px-3 text-[0.875rem]"
            >
              {t(def.labelKey)}
            </Toggle>
          ))}
        </fieldset>
        <div className="space-y-1">
          <p className="text-caption text-ink-muted">{t(a.def.captionKey)}</p>
          <Reading side={a} gap={gapFor(a.def)} />
        </div>
      </section>

      <TimelineScrubber bounds={bounds} />

      <Disclosure summary={t("layers.more")}>
        <div className="space-y-5 pt-1">
          <section aria-labelledby="compare-title" className="space-y-2">
            <h3 id="compare-title" className="text-body font-semibold text-ink">
              {t("compare.title")}
            </h3>
            <fieldset className="flex flex-wrap gap-2 border-0 p-0">
              <legend className="sr-only">{t("compare.mode")}</legend>
              {MODES.map((m) => (
                <Toggle
                  key={m}
                  pressed={state.compare === m}
                  onPressedChange={(on) => on && state.setCompare(m)}
                >
                  {t(COMPARE_COPY[m])}
                </Toggle>
              ))}
            </fieldset>
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
                <div key={k} className="flex flex-wrap items-center gap-2">
                  <Toggle
                    pressed={state.footprints[k]}
                    onPressedChange={(on) => state.setFootprint(k, on)}
                  >
                    {t(`footprints.${k}`)}
                  </Toggle>
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full"
                    style={{ background: FOOTPRINT_COLORS[k] }}
                  />
                  <ProvenanceChip
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
      <p className="sr-only">{labelFor(date ?? bounds.end, granularity)}</p>
    </div>
  );
}
