// Deterministic generator for the synthetic bundles. Run: node fixtures/synthetic/generate.mjs
// Data is SYNTHETIC (invented, not NASA data); real hero bundles come from issue #17.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = "synthetic";

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round = (x, d = 2) => Number(x.toFixed(d));

function dailyDates(startYear, years) {
  const out = [];
  const end = Date.UTC(startYear + years, 0, 1);
  for (let t = Date.UTC(startYear, 0, 1); t < end; t += 86400000) {
    out.push(new Date(t));
  }
  return out;
}

function provenance(unit, startYear, years, note) {
  return {
    source: SOURCE,
    product: `synthetic-${note}`,
    version: "1",
    resolution_m: 55000,
    period: { start: `${startYear}-01-01`, end: `${startYear + years - 1}-12-31` },
    quality: "low",
    derived_from: [],
    method: `synthetic ${unit} generator (seeded, not observed)`,
    retrieved: "2026-11-11",
  };
}

function series(variable, unit, startYear, years, note, fn) {
  const dates = dailyDates(startYear, years);
  const values = dates.map((d, i) => round(fn(d, i)));
  return {
    var: variable,
    unit,
    cadence: "daily",
    start: `${startYear}-01-01`,
    values,
    quality: values.map(() => 0),
    provenance: provenance(unit, startYear, years, note),
    segments: [{ start: `${startYear}-01-01`, source: SOURCE }],
  };
}

function buildBundle({ name, seed, polygon, centroid, elevation, slope, areaHa, wetness, soil, ndviPeak }) {
  const rnd = mulberry32(seed);
  const startYear = 2022;
  const years = 3;
  const doy = (d) => (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
  const season = (d) => Math.sin(((doy(d) - 100) / 365) * 2 * Math.PI);
  const tmean = (d) => 16 + 11 * season(d);
  const geometry = { type: "Polygon", coordinates: [polygon] };
  const rounded = JSON.stringify(polygon.map((p) => p.map((c) => round(c, 5))));
  const id = `sha256:${createHash("sha256").update(rounded).digest("hex")}`;
  const mk = (v, u, note, fn) => series(v, u, startYear, years, note, fn);
  return {
    schema: "field-bundle/1.0",
    field: {
      id,
      geometry,
      area_ha: areaHa,
      centroid,
      elevation_m: elevation,
      slope_mean_deg: slope,
    },
    generated_at: "2026-11-11T00:00:00Z",
    series: [
      mk("tmax", "degC", "weather", (d) => tmean(new Date(d)) + 6 + rnd() * 2),
      mk("tmin", "degC", "weather", (d) => tmean(new Date(d)) - 6 + rnd() * 2),
      mk("precip", "mm/day", "weather", (d) =>
        rnd() < wetness * (0.5 - 0.4 * season(new Date(d))) ? round(rnd() * 14, 1) : 0,
      ),
    ],
    phenology: [2022, 2023, 2024].map((s, i) => ({
      season: s,
      sos: `${s}-11-20`,
      peak: `${s + 1}-04-05`,
      eos: `${s + 1}-06-10`,
      peak_ndvi: round(ndviPeak - i * 0.04),
      provenance: provenance("ndvi", s, 1, "phenology"),
    })),
    layers: {},
    context: { synthetic: "true", label: name },
    soil,
    gaps: [
      { var: "sm_surface", reason: "synthetic bundle has no soil-moisture series", severity: "info" },
      { var: "ndvi", reason: "synthetic bundle has no NDVI series", severity: "warning" },
    ],
  };
}

const soilValue = (value, confidence) => ({ value, source: "synthetic", confidence });

const bundles = {
  "semi-arid-winter-cereal": buildBundle({
    name: "Synthetic semi-arid winter-cereal site",
    seed: 1,
    polygon: [[5.33, 36.12], [5.332, 36.12], [5.332, 36.122], [5.33, 36.122], [5.33, 36.12]],
    centroid: [5.331, 36.121],
    elevation: 980,
    slope: 3.1,
    areaHa: 4.1,
    wetness: 0.25,
    soil: {
      clay_pct: soilValue(34, "medium"),
      organic_carbon_pct: soilValue(0.9, "low"),
      awc_mm_per_m: soilValue(140, "medium"),
      depth_cm: soilValue(90, "low"),
    },
    ndviPeak: 0.62,
  }),
  "fallow-heavy": buildBundle({
    name: "Synthetic fallow-heavy site",
    seed: 2,
    polygon: [[-3.7, 39.5], [-3.698, 39.5], [-3.698, 39.502], [-3.7, 39.502], [-3.7, 39.5]],
    centroid: [-3.699, 39.501],
    elevation: 640,
    slope: 1.4,
    areaHa: 4.3,
    wetness: 0.15,
    soil: {
      clay_pct: soilValue(22, "medium"),
      sand_pct: soilValue(48, "medium"),
      organic_carbon_pct: soilValue(0.6, "low"),
    },
    ndviPeak: 0.41,
  }),
};

for (const [name, bundle] of Object.entries(bundles)) {
  writeFileSync(join(here, `${name}.bundle.json`), `${JSON.stringify(bundle)}\n`);
}
