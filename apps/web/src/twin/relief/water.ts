/**
 * Rain running over a height grid as a thin sheet (diffusive-wave overland flow). Between two
 * neighbouring cells water moves down the slope of the water surface at the speed Manning's formula
 * gives for a shallow sheet over rough ground: v = h^(2/3) * sqrt(slope) / n. Four neighbours per
 * cell. The grid edges are open: water that reaches them leaves and is counted. It ignores soil
 * soaking, crops and drains, so it shows where water would go, not how much would stay.
 */

export interface WaterTotals {
  rainedM3: number;
  leftM3: number;
  standingM3: number;
}

export interface Water {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  /** Metres of water standing on each cell, row 0 north. */
  readonly depth: Float32Array;
  /** Advances `dt` seconds with rain falling at `rainMps` metres per second. */
  step(dt: number, rainMps: number): void;
  totals(): WaterTotals;
  reset(): void;
}

/**
 * Manning roughness for sheet flow over cultivated soil with little residue (USDA TR-55, table 3-1).
 * An assumption about the surface, not a measurement of this field.
 */
export const MANNING_N = 0.06;
/** Share of the surface difference two cells may close in one step, so they never overshoot. */
const LEVEL_SHARE = 0.25;

/** A time step short enough for sheet flow slower than two metres per second to cross one cell. */
export function stableDt(cellM: number): number {
  return cellM / 2;
}

/** Block-mean reduction by a whole factor so that neither side exceeds `maxSide`. */
export function downsample(
  heights: Float32Array,
  width: number,
  height: number,
  maxSide: number,
): { heights: Float32Array; width: number; height: number; factor: number } {
  const factor = Math.max(1, Math.ceil(Math.max(width, height) / maxSide));
  if (factor === 1) return { heights, width, height, factor };
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      let sum = 0;
      for (let dy = 0; dy < factor; dy++) {
        const base = (row * factor + dy) * width + col * factor;
        for (let dx = 0; dx < factor; dx++) sum += heights[base + dx] as number;
      }
      out[row * w + col] = sum / (factor * factor);
    }
  }
  return { heights: out, width: w, height: h, factor };
}

export function createWater(
  terrain: Float32Array,
  width: number,
  height: number,
  cellM: number,
): Water {
  const count = width * height;
  if (terrain.length !== count || width < 2 || height < 2) {
    throw new RangeError("heights do not match the grid");
  }
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(terrain[i])) throw new RangeError("heights must be finite");
  }
  const area = cellM * cellM;
  // Double precision inside: millimetres of water sit on ground heights of a thousand metres.
  const ground = Float64Array.from(terrain);
  const water = new Float64Array(count);
  const depth = new Float32Array(count);
  // Volume moved this step from each cell to its east and south neighbour (negative: the other way).
  const east = new Float64Array(count);
  const south = new Float64Array(count);
  // Volume each edge cell sends off the grid, and the total each cell gives away.
  const off = new Float64Array(count);
  const given = new Float64Array(count);
  let rained = 0;
  let left = 0;

  /** Volume that crosses between cells `a` and `b` in `dt`; positive from `a` to `b`. */
  function exchange(a: number, b: number, dt: number): number {
    const groundA = ground[a] as number;
    const groundB = ground[b] as number;
    const surfaceA = groundA + (water[a] as number);
    const surfaceB = groundB + (water[b] as number);
    const drop = surfaceA - surfaceB;
    if (drop === 0) return 0;
    // Only the water standing above the higher of the two grounds can cross.
    const sheet = Math.max(surfaceA, surfaceB) - Math.max(groundA, groundB);
    if (sheet <= 0) return 0;
    const fall = Math.abs(drop);
    const flow = (cellM * sheet ** (5 / 3) * Math.sqrt(fall / cellM)) / MANNING_N;
    const volume = Math.min(flow * dt, LEVEL_SHARE * fall * area);
    return drop > 0 ? volume : -volume;
  }

  function step(dt: number, rainMps: number): void {
    if (rainMps > 0) {
      const add = rainMps * dt;
      for (let i = 0; i < count; i++) water[i] = (water[i] as number) + add;
      rained += add * area * count;
    }
    given.fill(0);
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const e = col < width - 1 ? exchange(i, i + 1, dt) : 0;
        const s = row < height - 1 ? exchange(i, i + width, dt) : 0;
        east[i] = e;
        south[i] = s;
        if (e > 0) given[i] = (given[i] as number) + e;
        else if (e < 0) given[i + 1] = (given[i + 1] as number) - e;
        if (s > 0) given[i] = (given[i] as number) + s;
        else if (s < 0) given[i + width] = (given[i + width] as number) - s;
        // An edge cell also sheds over each open side, down its own depth.
        const sides =
          (col === 0 ? 1 : 0) +
          (col === width - 1 ? 1 : 0) +
          (row === 0 ? 1 : 0) +
          (row === height - 1 ? 1 : 0);
        const h = water[i] as number;
        if (sides > 0 && h > 0) {
          const flow = (cellM * h ** (5 / 3) * Math.sqrt(h / cellM)) / MANNING_N;
          const volume = sides * Math.min(flow * dt, LEVEL_SHARE * h * area);
          off[i] = volume;
          given[i] = (given[i] as number) + volume;
        } else {
          off[i] = 0;
        }
      }
    }
    // A cell never gives away more than it holds: scale all its outflows together.
    for (let i = 0; i < count; i++) {
      const out = given[i] as number;
      const held = (water[i] as number) * area;
      given[i] = out > held ? held / out : 1;
    }
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const i = row * width + col;
        const e = east[i] as number;
        if (e !== 0) {
          const moved = e * (given[e > 0 ? i : i + 1] as number);
          water[i] = (water[i] as number) - moved / area;
          water[i + 1] = (water[i + 1] as number) + moved / area;
        }
        const s = south[i] as number;
        if (s !== 0) {
          const moved = s * (given[s > 0 ? i : i + width] as number);
          water[i] = (water[i] as number) - moved / area;
          water[i + width] = (water[i + width] as number) + moved / area;
        }
        const gone = (off[i] as number) * (given[i] as number);
        if (gone > 0) {
          water[i] = (water[i] as number) - gone / area;
          left += gone;
        }
      }
    }
    for (let i = 0; i < count; i++) {
      const h = Math.max(0, water[i] as number);
      water[i] = h;
      depth[i] = h;
    }
  }

  return {
    width,
    height,
    cellM,
    depth,
    step,
    totals() {
      let standing = 0;
      for (let i = 0; i < count; i++) standing += water[i] as number;
      return { rainedM3: rained, leftM3: left, standingM3: standing * area };
    },
    reset() {
      water.fill(0);
      depth.fill(0);
      rained = 0;
      left = 0;
    },
  };
}
