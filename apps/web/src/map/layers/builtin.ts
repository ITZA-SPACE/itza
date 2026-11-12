import type { CanonicalSeries, FieldBundle } from "@itza/engine/contracts";
import { type DateRange, shiftYears, toDay } from "../timeline/periods";
import { type LayerContext, type LayerDef, type Reading, registerLayer } from "./registry";
import { coverage, latestBefore, stepsIn } from "./series";

const HEAT_C = 35;
const FROST_C = 0;
const NDVI_MAX_AGE_DAYS = 32;

const seriesOf = (b: FieldBundle, v: CanonicalSeries["var"]) => b.series.find((s) => s.var === v);

export function formatResolution(m: number): string {
  return m >= 1000 ? `${+(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function provenanceOf(s: CanonicalSeries, period: string) {
  return {
    source: s.provenance.product,
    resolution: formatResolution(s.provenance.resolution_m),
    period,
  };
}

const span = (r: DateRange) => `${r.start} to ${r.end}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** The same window in every other year the series covers, as one aggregate each. */
function otherYears(s: CanonicalSeries, period: DateRange, agg: (xs: number[]) => number) {
  const cov = coverage(s);
  const year = Number(period.start.slice(0, 4));
  const out: number[] = [];
  for (let y = Number(cov.start.slice(0, 4)); y <= Number(cov.end.slice(0, 4)); y++) {
    if (y === year) continue;
    const window = shiftYears(period, y - year);
    if (window.start < cov.start || window.end > cov.end) continue;
    const xs = stepsIn(s, window).map((x) => x.value);
    if (xs.length > 0) out.push(agg(xs));
  }
  return out;
}

function anomaly(
  s: CanonicalSeries | undefined,
  { period }: LayerContext,
  agg: (xs: number[]) => number,
  relative: boolean,
  scale: number,
): Reading | null {
  if (!s) return null;
  const now = stepsIn(s, period).map((x) => x.value);
  const past = otherYears(s, period, agg);
  if (now.length === 0 || past.length === 0) return null;
  const normal = mean(past);
  const diff = agg(now) - normal;
  const value = relative ? (normal === 0 ? 0 : (diff / normal) * 100) : diff;
  return {
    value,
    fraction: 0.5 + value / (2 * scale),
    provenance: provenanceOf(s, span(period)),
  };
}

function countDays(
  s: CanonicalSeries | undefined,
  { period }: LayerContext,
  hit: (v: number) => boolean,
): Reading | null {
  if (!s) return null;
  const steps = stepsIn(s, period);
  if (steps.length === 0) return null;
  const days = toDay(period.end) - toDay(period.start) + 1;
  const value = steps.filter((x) => hit(x.value)).length;
  return { value, fraction: value / days, provenance: provenanceOf(s, span(period)) };
}

const BUILTIN: LayerDef[] = [
  {
    id: "ndvi",
    labelKey: "layers.ndvi.label",
    captionKey: "layers.ndvi.caption",
    valueKey: "layers.ndvi.value",
    colors: ["#e9dfb8", "#9bc66b", "#1a7f3c"],
    gapVar: "ndvi",
    compute: ({ bundle, period }) => {
      const s = seriesOf(bundle, "ndvi");
      const latest = s && latestBefore(s, period.end, NDVI_MAX_AGE_DAYS);
      return s && latest
        ? { value: latest.value, fraction: latest.value, provenance: provenanceOf(s, latest.date) }
        : null;
    },
  },
  {
    id: "soil-moisture",
    labelKey: "layers.soilMoisture.label",
    captionKey: "layers.soilMoisture.caption",
    valueKey: "layers.soilMoisture.value",
    colors: ["#b0702d", "#f4f1ea", "#1f6fb5"],
    gapVar: "sm_surface",
    compute: (c) => anomaly(seriesOf(c.bundle, "sm_surface"), c, mean, false, 0.1),
  },
  {
    id: "rainfall",
    labelKey: "layers.rainfall.label",
    captionKey: "layers.rainfall.caption",
    valueKey: "layers.rainfall.value",
    colors: ["#b0702d", "#f4f1ea", "#1f6fb5"],
    gapVar: "precip",
    compute: (c) => anomaly(seriesOf(c.bundle, "precip"), c, sum, true, 100),
  },
  {
    id: "heat-days",
    labelKey: "layers.heat.label",
    captionKey: "layers.heat.caption",
    valueKey: "layers.heat.value",
    colors: ["#fdf0d5", "#f08a24", "#a1260d"],
    gapVar: "tmax",
    compute: (c) => countDays(seriesOf(c.bundle, "tmax"), c, (v) => v >= HEAT_C),
  },
  {
    id: "frost-days",
    labelKey: "layers.frost.label",
    captionKey: "layers.frost.caption",
    valueKey: "layers.frost.value",
    colors: ["#eaf3fb", "#7fb2e0", "#2a4f9a"],
    gapVar: "tmin",
    compute: (c) => countDays(seriesOf(c.bundle, "tmin"), c, (v) => v <= FROST_C),
  },
  {
    id: "bare-soil",
    labelKey: "layers.bareSoil.label",
    captionKey: "layers.bareSoil.caption",
    valueKey: "layers.bareSoil.value",
    colors: ["#e8f1e0", "#d6b27a", "#8a5a2b"],
    gapVar: "ndvi",
    compute: ({ bundle, period }) => {
      const ndvi = seriesOf(bundle, "ndvi");
      if (!ndvi || bundle.phenology.length === 0) return null;
      const a = toDay(period.start);
      const b = toDay(period.end);
      let bare = 0;
      for (let d = a; d <= b; d++) {
        if (
          bundle.phenology.some((p) =>
            p.bare_windows.some((w) => d >= toDay(w.start) && d <= toDay(w.end)),
          )
        )
          bare++;
      }
      const value = (bare / (b - a + 1)) * 100;
      return { value, fraction: value / 100, provenance: provenanceOf(ndvi, span(period)) };
    },
  },
  {
    id: "slope",
    labelKey: "layers.slope.label",
    captionKey: "layers.slope.caption",
    valueKey: "layers.slope.value",
    colors: ["#eef3e6", "#d8a657", "#8f2d1a"],
    gapVar: "slope",
    compute: ({ bundle }) => {
      const s = seriesOf(bundle, "slope");
      const value = bundle.field.slope_mean_deg;
      return s && value !== null
        ? { value, fraction: value / 15, provenance: provenanceOf(s, s.provenance.period.end) }
        : null;
    },
  },
];

for (const layer of BUILTIN) registerLayer(layer);
