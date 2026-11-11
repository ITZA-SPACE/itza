import type { CriterionValues, Priorities } from "../contracts";

export const CRITERIA = [
  "climate_fit",
  "water_balance",
  "soil_nitrogen",
  "organic_matter",
  "erosion_control",
  "bare_exposure",
  "pest_pressure",
  "forage_income",
] as const satisfies readonly (keyof CriterionValues)[];
export type Criterion = (typeof CRITERIA)[number];
export const CRITERIA_COUNT = CRITERIA.length;

/**
 * Where each priority slider sends its weight. Climate fit has no slider of its own and follows
 * water; bare-field exposure follows soil health. Forage and income share one criterion.
 */
const PRIORITY_TO_CRITERIA: Record<keyof Priorities, Partial<Record<Criterion, number>>> = {
  water: { water_balance: 0.7, climate_fit: 0.3 },
  soil_health: { organic_matter: 0.6, bare_exposure: 0.4 },
  nitrogen: { soil_nitrogen: 1 },
  erosion: { erosion_control: 1 },
  forage: { forage_income: 1 },
  income: { forage_income: 1 },
  pest_break: { pest_pressure: 1 },
};

/**
 * Criterion weights w_k that sum to 1 from the 0 to 5 priority sliders. All sliders at 0 give equal
 * weights, so a score can always be computed.
 */
export function criterionWeights(priorities: Priorities): Float64Array {
  const weights = new Float64Array(CRITERIA_COUNT);
  const total = Object.values(priorities).reduce((a, b) => a + b, 0);
  if (total <= 0) return weights.fill(1 / CRITERIA_COUNT);
  for (const [priority, targets] of Object.entries(PRIORITY_TO_CRITERIA)) {
    const share = priorities[priority as keyof Priorities] / total;
    for (const [criterion, fraction] of Object.entries(targets)) {
      const k = CRITERIA.indexOf(criterion as Criterion);
      weights[k] = (weights[k] as number) + share * (fraction as number);
    }
  }
  return weights;
}

/** Weighted contributions w_k f_k and their sum, the composite S = sum w_k f_k. */
export function composite(
  criteria: ArrayLike<number>,
  weights: ArrayLike<number>,
  contributions: Float64Array = new Float64Array(CRITERIA_COUNT),
): number {
  let sum = 0;
  for (let k = 0; k < CRITERIA_COUNT; k++) {
    const c = (weights[k] as number) * (criteria[k] as number);
    contributions[k] = c;
    sum += c;
  }
  return sum;
}

export function toCriterionValues(values: ArrayLike<number>): CriterionValues {
  return Object.fromEntries(
    CRITERIA.map((name, k) => [name, values[k]]),
  ) as unknown as CriterionValues;
}
