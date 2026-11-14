// Grid cells of the coarse products, drawn over the field so its small size next to them is visible.
// Each is built from the product's published grid definition.

type Ring = [number, number][];
export type FootprintKind = "smap" | "power" | "modis";
export type Bbox = [number, number, number, number];

const RAD = Math.PI / 180;
const close = (r: Ring): Ring => [...r, r[0] as [number, number]];

/** NASA POWER (MERRA-2) grid: 0.5 degrees of latitude by 0.625 of longitude, centred on multiples of both. */
export function powerCell(lon: number, lat: number): Ring {
  const lonC = Math.round((lon + 180) / 0.625) * 0.625 - 180;
  const latC = Math.round((lat + 90) / 0.5) * 0.5 - 90;
  const [w, e, s, n] = [lonC - 0.3125, lonC + 0.3125, latC - 0.25, latC + 0.25];
  return close([
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ]);
}

// SMAP L4 9 km grid: EASE-Grid 2.0 global, cylindrical equal-area on the WGS 84 ellipsoid with true
// scale at 30 degrees (EPSG:6933; Snyder 1987, pp. 81 and 87). A sphere puts the cell rows ~20 km off.
const EASE_A = 6378137;
const EASE_E2 = 0.0066943799901413165;
const EASE_E = Math.sqrt(EASE_E2);
const EASE_K0 = Math.cos(30 * RAD) / Math.sqrt(1 - EASE_E2 * Math.sin(30 * RAD) ** 2);
const EASE_CELL = 9008.055210146;
const EASE_ULX = -17367530.445;
const EASE_ULY = 7314540.831;
const easeQ = (sin: number) =>
  (1 - EASE_E2) *
  (sin / (1 - EASE_E2 * sin * sin) -
    Math.log((1 - EASE_E * sin) / (1 + EASE_E * sin)) / (2 * EASE_E));
const EASE_QP = easeQ(1);
const easeX = (lon: number) => EASE_A * EASE_K0 * lon * RAD;
const easeY = (lat: number) => (EASE_A * easeQ(Math.sin(lat * RAD))) / (2 * EASE_K0);
const easeLon = (x: number) => x / (EASE_A * EASE_K0) / RAD;
function easeLat(y: number): number {
  const beta = Math.asin((2 * y * EASE_K0) / (EASE_A * EASE_QP));
  const [e4, e6] = [EASE_E2 ** 2, EASE_E2 ** 3];
  const lat =
    beta +
    (EASE_E2 / 3 + (31 * e4) / 180 + (517 * e6) / 5040) * Math.sin(2 * beta) +
    ((23 * e4) / 360 + (251 * e6) / 3780) * Math.sin(4 * beta) +
    ((761 * e6) / 45360) * Math.sin(6 * beta);
  return lat / RAD;
}

export function smapCell(lon: number, lat: number): Ring {
  const col = Math.floor((easeX(lon) - EASE_ULX) / EASE_CELL);
  const row = Math.floor((EASE_ULY - easeY(lat)) / EASE_CELL);
  const [x0, x1] = [EASE_ULX + col * EASE_CELL, EASE_ULX + (col + 1) * EASE_CELL];
  const [y0, y1] = [EASE_ULY - (row + 1) * EASE_CELL, EASE_ULY - row * EASE_CELL];
  return close([
    [easeLon(x0), easeLat(y0)],
    [easeLon(x1), easeLat(y0)],
    [easeLon(x1), easeLat(y1)],
    [easeLon(x0), easeLat(y1)],
  ]);
}

// MODIS 250 m pixels: sinusoidal grid, 4800 pixels across a 1111950.52 m tile.
const SIN_R = 6371007.181;
const PIXEL = 1111950.5196666666 / 4800;
const SIN_ULX = -20015109.354;
const SIN_ULY = 10007554.677;
const MAX_PIXELS = 2000;

const sinX = (lon: number, lat: number) => SIN_R * lon * RAD * Math.cos(lat * RAD);
const sinY = (lat: number) => SIN_R * lat * RAD;

function sinInverse(x: number, y: number): [number, number] {
  const lat = y / SIN_R;
  return [x / (SIN_R * Math.cos(lat)) / RAD, lat / RAD];
}

/** Every MODIS 250 m pixel that touches the bounding box (none if that would be unreasonably many). */
export function modisPixels([w, s, e, n]: Bbox): Ring[] {
  const xs = [sinX(w, s), sinX(w, n), sinX(e, s), sinX(e, n)];
  const [col0, col1] = [
    Math.floor((Math.min(...xs) - SIN_ULX) / PIXEL),
    Math.floor((Math.max(...xs) - SIN_ULX) / PIXEL),
  ];
  const [row0, row1] = [
    Math.floor((SIN_ULY - sinY(n)) / PIXEL),
    Math.floor((SIN_ULY - sinY(s)) / PIXEL),
  ];
  if ((col1 - col0 + 1) * (row1 - row0 + 1) > MAX_PIXELS) return [];
  const out: Ring[] = [];
  for (let row = row0; row <= row1; row++) {
    const [yTop, yBottom] = [SIN_ULY - row * PIXEL, SIN_ULY - (row + 1) * PIXEL];
    for (let col = col0; col <= col1; col++) {
      const [xl, xr] = [SIN_ULX + col * PIXEL, SIN_ULX + (col + 1) * PIXEL];
      out.push(
        close([
          sinInverse(xl, yBottom),
          sinInverse(xr, yBottom),
          sinInverse(xr, yTop),
          sinInverse(xl, yTop),
        ]),
      );
    }
  }
  return out;
}
