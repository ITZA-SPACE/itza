/**
 * FAO-56 Penman-Monteith reference evapotranspiration, daily step
 * (Allen et al. 1998, equations 6, 7, 8, 12, 13, 17, 19, 21, 23, 24, 37, 38, 39, 47).
 */
const SOLAR_CONSTANT = 0.082; // MJ m-2 min-1
const STEFAN_BOLTZMANN = 4.903e-9; // MJ K-4 m-2 day-1
const ALBEDO = 0.23;

/** Saturation vapour pressure in kPa at air temperature `t` in degrees C (eq. 11). */
export function saturationVapourPressure(t: number): number {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
}

/** Extra-terrestrial radiation in MJ m-2 day-1 (eq. 21) for a latitude in degrees and day of year. */
export function extraterrestrialRadiation(latitudeDeg: number, doy: number): number {
  const phi = (latitudeDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  // Clamped so polar day and night give 0 or full-day sunset angles instead of NaN.
  const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(delta))));
  return (
    ((24 * 60) / Math.PI) *
    SOLAR_CONSTANT *
    dr *
    (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
  );
}

export interface Et0Input {
  /** Daily maximum and minimum air temperature, degrees C. */
  tmax: number;
  tmin: number;
  /** Daily mean temperature; defaults to (tmax + tmin) / 2. */
  tmean?: number;
  /** Wind speed at 2 m, m/s. */
  wind2m: number;
  /** Incoming shortwave radiation, MJ m-2 day-1. */
  srad: number;
  elevationM: number;
  latitudeDeg: number;
  /** Day of year, 1 to 366. */
  doy: number;
  /** Actual vapour pressure in kPa, when measured. Wins over the humidity fields. */
  ea?: number;
  /** Maximum and minimum relative humidity in percent (eq. 17). Win over `rhMean`. */
  rhMax?: number;
  rhMin?: number;
  /** Mean relative humidity in percent (the POWER RH2M case). */
  rhMean?: number;
  /** Soil heat flux in MJ m-2 day-1. About 0 at a daily step. */
  soilHeatFlux?: number;
}

function actualVapourPressure(input: Et0Input, tmean: number): number {
  if (input.ea !== undefined) return input.ea;
  if (input.rhMax !== undefined && input.rhMin !== undefined) {
    return (
      (saturationVapourPressure(input.tmin) * (input.rhMax / 100) +
        saturationVapourPressure(input.tmax) * (input.rhMin / 100)) /
      2
    );
  }
  if (input.rhMean !== undefined) {
    const es = (saturationVapourPressure(input.tmax) + saturationVapourPressure(input.tmin)) / 2;
    return (input.rhMean / 100) * es;
  }
  // FAO-56 fallback when no humidity is known: dew point near Tmin (eq. 48).
  return saturationVapourPressure(input.tmin);
}

/** Reference evapotranspiration ET0 in mm/day. Never negative. */
export function et0Daily(input: Et0Input): number {
  const tmean = input.tmean ?? (input.tmax + input.tmin) / 2;
  const z = input.elevationM;
  const pressure = 101.3 * ((293 - 0.0065 * z) / 293) ** 5.26;
  const gamma = 0.000665 * pressure;
  const delta = (4098 * saturationVapourPressure(tmean)) / (tmean + 237.3) ** 2;

  const es = (saturationVapourPressure(input.tmax) + saturationVapourPressure(input.tmin)) / 2;
  const ea = actualVapourPressure(input, tmean);

  const ra = extraterrestrialRadiation(input.latitudeDeg, input.doy);
  const rso = (0.75 + 2e-5 * z) * ra;
  const rns = (1 - ALBEDO) * input.srad;
  const relative = rso > 0 ? Math.min(input.srad / rso, 1) : 0.5;
  const rnl =
    STEFAN_BOLTZMANN *
    (((input.tmax + 273.16) ** 4 + (input.tmin + 273.16) ** 4) / 2) *
    (0.34 - 0.14 * Math.sqrt(Math.max(ea, 0))) *
    (1.35 * relative - 0.35);
  const rn = rns - rnl;

  const numerator =
    0.408 * delta * (rn - (input.soilHeatFlux ?? 0)) +
    gamma * (900 / (tmean + 273)) * input.wind2m * (es - ea);
  const denominator = delta + gamma * (1 + 0.34 * input.wind2m);
  return Math.max(0, numerator / denominator);
}
