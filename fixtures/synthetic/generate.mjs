// Builds the two synthetic Field Data Bundles. Deterministic: same output on every run.
//   node fixtures/synthetic/generate.mjs
// SYNTHETIC DATA: invented numbers for tests and demos of the contracts. Not real observations.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const START = Date.UTC(2021, 8, 1); // 2021-09-01, start of season 2021-22
const DAYS = 1096; // three seasons to 2024-08-31
const DAY_MS = 86_400_000;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value, digits) => Number(value.toFixed(digits));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayOfYear = (ms) => Math.floor((ms - Date.UTC(new Date(ms).getUTCFullYear(), 0, 0)) / DAY_MS);

const SITES = [
  {
    key: "semi-arid-winter-cereal",
    seed: 20211,
    centroid: [5.33, 36.12],
    elevation: 980,
    slope: 3.1,
    arid: 1,
    seasons: [
      { season: "2021-22", crop: "wheat_winter", confidence: "high" },
      { season: "2022-23", crop: "barley", confidence: "high" },
      { season: "2023-24", crop: "wheat_winter", confidence: "medium" },
    ],
    soil: { clay_pct: 34, sand_pct: 28, soc_pct: 0.9, ph: 7.9, awc_mm_per_m: 140 },
  },
  {
    key: "fallow-heavy",
    seed: 20212,
    centroid: [4.9, 35.7],
    elevation: 1120,
    slope: 1.4,
    arid: 1.15,
    seasons: [
      { season: "2021-22", crop: "fallow", confidence: "medium" },
      { season: "2022-23", crop: "wheat_winter", confidence: "high" },
      { season: "2023-24", crop: "fallow", confidence: "high" },
    ],
    soil: { clay_pct: 26, sand_pct: 41, soc_pct: 0.7, ph: 8.1, awc_mm_per_m: 120 },
  },
];

function weather(site) {
  const random = rng(site.seed);
  const out = { tmax: [], tmin: [], tmean: [], rh: [], wind2m: [], srad: [], precip: [], sm: [] };
  let soil = 0.18;
  for (let i = 0; i < DAYS; i++) {
    const ms = START + i * DAY_MS;
    const phase = (2 * Math.PI * (dayOfYear(ms) - 200)) / 365; // warmest near day 200
    const tmean = 16 + 11 * Math.cos(phase) + (random() - 0.5) * 4;
    const range = 11 + 3 * Math.cos(phase) + (random() - 0.5) * 2;
    const wet = 0.1 + 0.16 * (1 - Math.cos(phase)) * 0.5 + 0.08 * Math.cos(phase - Math.PI);
    const rain = random() < wet / site.arid ? -Math.log(1 - random()) * 5.5 : 0;
    const srad = 15.5 - 8 * (1 - Math.cos(phase)) * 0.5 + 7 * Math.cos(phase) * 0.5 - rain * 0.15;
    soil = Math.min(
      0.4,
      Math.max(0.08, soil + rain * 0.004 - 0.003 - Math.max(0, tmean - 15) * 0.0002),
    );
    out.tmax.push(round(tmean + range / 2, 1));
    out.tmin.push(round(tmean - range / 2, 1));
    out.tmean.push(round(tmean, 1));
    out.rh.push(
      round(
        Math.min(95, Math.max(18, 62 - 20 * Math.cos(phase) + rain * 1.2 + (random() - 0.5) * 12)),
        0,
      ),
    );
    out.wind2m.push(round(2.2 + random() * 2.2, 1));
    out.srad.push(round(Math.max(2, srad + (random() - 0.5) * 2), 1));
    out.precip.push(round(rain, 1));
    out.sm.push(round(soil, 3));
  }
  return out;
}

/** NDVI every 16 days: bare soil baseline, plus a Gaussian bump over each crop season. */
function ndvi(site) {
  const random = rng(site.seed + 7);
  const values = [];
  const steps = Math.ceil(DAYS / 16);
  for (let step = 0; step < steps; step++) {
    const day = step * 16;
    const seasonIndex = Math.min(2, Math.floor(day / 365));
    const crop = site.seasons[seasonIndex].crop;
    const withinSeason = day - seasonIndex * 365;
    const peakDay = 215; // early May for a September season start
    const amplitude = crop === "fallow" ? 0.1 : 0.55;
    const width = crop === "fallow" ? 70 : 55;
    const bump = amplitude * Math.exp(-(((withinSeason - peakDay) / width) ** 2));
    values.push(round(Math.min(0.9, 0.14 + bump + (random() - 0.5) * 0.04), 2));
  }
  return values;
}

function provenance(source, product, version, resolution, quality) {
  return {
    source,
    product,
    version,
    resolution_m: resolution,
    period: { start: iso(START), end: iso(START + (DAYS - 1) * DAY_MS) },
    quality,
    method: "area_weighted",
    retrieved: "2026-11-10",
  };
}

function series(variable, unit, cadence, values, prov, extra = {}) {
  return {
    var: variable,
    unit,
    cadence,
    start: iso(START),
    values,
    quality: values.map(() => 0),
    provenance: prov,
    ...extra,
  };
}

function squareField(centroid, areaHa) {
  const half = Math.sqrt(areaHa * 10_000) / 2;
  const dLat = half / 111_320;
  const dLon = half / (111_320 * Math.cos((centroid[1] * Math.PI) / 180));
  const [lon, lat] = centroid;
  const ring = [
    [lon - dLon, lat - dLat],
    [lon + dLon, lat - dLat],
    [lon + dLon, lat + dLat],
    [lon - dLon, lat + dLat],
    [lon - dLon, lat - dLat],
  ].map(([x, y]) => [round(x, 5), round(y, 5)]);
  return { type: "Polygon", coordinates: [ring] };
}

function bundle(site) {
  const w = weather(site);
  const power = provenance("nasa_power_daily", "POWER Daily API", "v2.10", 55_000, "medium");
  const geometry = squareField(site.centroid, 12.4);
  const phenology = site.seasons.map((s, i) => {
    const year = 2021 + i;
    const crop = s.crop;
    return {
      season: s.season,
      period: { start: `${year}-09-01`, end: `${year + 1}-08-31` },
      inferred: { crop, confidence: s.confidence },
      ...(crop === "fallow"
        ? { peak_ndvi: 0.24 }
        : {
            green_up: `${year}-11-20`,
            peak_ndvi: 0.69,
            peak_date: `${year + 1}-04-15`,
            senescence: `${year + 1}-05-30`,
          }),
      bare_windows: [{ start: `${year + 1}-07-01`, end: `${year + 1}-08-31` }],
    };
  });
  const tmean = series("tmean", "degC", "daily", w.tmean, power);
  tmean.quality[400] = 1; // one gap-filled day, so the flag is exercised
  tmean.segments = [{ start: iso(START), source: "nasa_power_daily" }];
  return {
    schema: "field-bundle/1.0",
    field: {
      id: `sha256:${createHash("sha256").update(JSON.stringify(geometry)).digest("hex")}`,
      geometry,
      area_ha: 12.4,
      centroid: site.centroid,
      elevation_m: site.elevation,
      slope_mean_deg: site.slope,
    },
    generated_at: "2026-11-10T00:00:00Z",
    series: [
      series("tmax", "degC", "daily", w.tmax, power),
      series("tmin", "degC", "daily", w.tmin, power),
      tmean,
      series("rh", "percent", "daily", w.rh, power),
      series("wind2m", "m/s", "daily", w.wind2m, power),
      series("srad", "MJ/m2/day", "daily", w.srad, power),
      series("precip", "mm/day", "daily", w.precip, power),
      series(
        "sm_rootzone",
        "m3/m3",
        "daily",
        w.sm,
        provenance("smap_l4", "SPL4SMGP", "7", 9_000, "medium"),
      ),
      series(
        "ndvi",
        "unitless",
        "16day",
        ndvi(site),
        provenance("modis_mod13q1_ornl", "MOD13Q1", "061", 250, "high"),
      ),
      series(
        "elevation",
        "m",
        "static",
        [site.elevation],
        provenance("nasadem", "NASADEM_HGT", "001", 30, "high"),
      ),
      series(
        "slope",
        "deg",
        "static",
        [site.slope],
        provenance("nasadem", "NASADEM_HGT", "001", 30, "high"),
      ),
    ],
    phenology,
    layers: { ndvi_frames: "frames/index.json" },
    context: { grace_tws_trend_cm_per_yr: -0.8, gedi_footprints: 14 },
    soil: Object.fromEntries(
      Object.entries(site.soil).map(([name, value]) => [
        name,
        { value, source: "soilgrids", confidence: "medium" },
      ]),
    ),
    gaps: [
      { var: "sm_surface", reason: "SMAP cell is much larger than the field", severity: "info" },
    ],
  };
}

for (const site of SITES) {
  writeFileSync(
    join(here, `${site.key}.bundle.json`),
    `${JSON.stringify(bundle(site), null, 1)}\n`,
  );
}
console.log("Synthetic bundles written.");
