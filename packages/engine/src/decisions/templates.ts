/**
 * Plain-English sentence templates for evidence cards and confidence reasons (F-08, F-11). Every
 * sentence takes its numbers from computed results, never from free text. Chrome copy (labels,
 * buttons) lives in the web app; these sentences carry numbers, so they are built here.
 */

const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (x: number, digits = 2) => x.toFixed(digits);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Distance as a person reads it: metres below 1 km, kilometres above. */
export function distance(meters: number): string {
  return meters >= 1000 ? `${Math.round(meters / 1000)} km` : `${Math.round(meters)} m`;
}

export const confidenceText = {
  coverage: (share: number) =>
    share >= 0.98
      ? `Weather was observed on ${pct(share)} of the days in the record.`
      : `Weather was observed on only ${pct(share)} of the days in the record; the rest is filled in.`,
  scale: (resolutionM: number, source: string, fieldHa: number, ratio: number) =>
    `${source} weather comes from a cell about ${distance(resolutionM)} across, roughly ${Math.round(ratio)} times the width of your ${num(fieldHa, 1)} ha field.`,
  agreement: (correlation: number, months: number) =>
    correlation >= 0.5
      ? `Modeled soil water follows the satellite soil moisture (correlation ${num(correlation)} over ${months} months).`
      : `Modeled soil water follows the satellite soil moisture only weakly (correlation ${num(correlation)} over ${months} months).`,
  noAgreement: "There is not enough satellite soil moisture to check the model against.",
  traits: (lowShare: number, needsReview: boolean) =>
    `${pct(lowShare)} of the crop traits behind this rotation are team estimates${needsReview ? " that a local agronomist has not reviewed yet" : ""}.`,
  noTraits: "Crop trait confidence could not be checked for this rotation.",
  groundTruth: (items: string[]) =>
    `You provided ${items.join(", ")}, which replace satellite estimates.`,
  noGroundTruth:
    "No soil test or field observations from you yet; soil and dates come from satellite and regional defaults.",
};

export const gapText = {
  bundle: (variable: string, reason: string) => `${variable}: ${reason}.`,
  scale: (resolutionM: number, source: string, fieldHa: number) =>
    `${source} weather is a cell about ${distance(resolutionM)} across, much larger than your ${num(fieldHa, 1)} ha field, so it describes the area, not the field.`,
  traits: (crops: string[]) =>
    `Crop traits for ${crops.join(", ")} are team estimates still waiting for local expert review.`,
  noSoilTest: (source: string) =>
    `No soil test: soil water capacity comes from ${source}. A soil test would sharpen it.`,
  noSatellite: "No satellite soil moisture to cross-check the model.",
  skippedSeasons: (crop: string, replayed: number, usable: number) =>
    `${crop}: only ${replayed} of ${usable} usable seasons could be replayed because its season runs past the weather record.`,
  equipment: (limit: string) =>
    `The equipment limit "${limit}" was not applied: the crop packs have no machinery data for it.`,
};

export const riskText = {
  pest: (crop: string, pest: string, seasons: number) =>
    `${crop} returns after ${plural(seasons, "season")} away; ${pest} needs more time. Check local pest pressure.`,
  frost: (seasons: number, total: number) =>
    `Frost or heat damaged ${seasons} of ${total} replayed seasons. Check local frost dates before sowing.`,
  waterlogging: (crop: string) =>
    `Heavy soil with slow drainage: ${crop} can suffer in wet winters. Check drainage before sowing.`,
  market: (crop: string) =>
    `No market is flagged for ${crop} in this region. Confirm a buyer before planting.`,
  arena: (note: string) => note,
};

export const benefitText = {
  better: (label: string, value: number, baseline: number | null) =>
    baseline === null
      ? `${label} scores ${num(value)} on average across the replayed seasons.`
      : `${label} scores ${num(value)} against ${num(baseline)} for your current rotation.`,
  nitrogen: (crop: string, kg: number) =>
    `${crop} leaves about ${Math.round(kg)} kg of nitrogen per hectare for the next crop.`,
  cover: (months: number) => `Keeps the soil covered about ${plural(months, "month")} of the year.`,
  fallow: "A fallow season stores rain in the soil for the crop that follows.",
  forage: (crop: string) => `${crop} can feed livestock as well as bring income.`,
  generic: (score: number, seasons: number) =>
    `Scores ${num(score)} in the replay of ${plural(seasons, "past season")}.`,
};

export const headlineText = {
  water: (
    severe: number,
    total: number,
    baselineSevere: number | null,
    baselineTotal: number | null,
  ) =>
    baselineSevere === null || baselineTotal === null
      ? `Severe water stress in ${severe} of ${total} past seasons.`
      : `Severe water stress in ${severe} of ${total} past seasons, against ${baselineSevere} of ${baselineTotal} for your current rotation.`,
};

export const whyText = {
  baseline: (score: number) =>
    `This is your current rotation. It scores ${num(score)} in the replay of past seasons.`,
  better: (score: number, baselineScore: number, drivers: string[]) =>
    `Scores ${num(score)} against ${num(baselineScore)} for your current rotation${drivers.length > 0 ? `, mainly through ${drivers.join(" and ")}` : ""}.`,
  worse: (score: number, baselineScore: number, drivers: string[]) =>
    `Scores ${num(score)}, below ${num(baselineScore)} for your current rotation${drivers.length > 0 ? `, but better on ${drivers.join(" and ")}` : ""}.`,
  alone: (score: number) => `Scores ${num(score)} in the replay of past seasons.`,
};

export const criterionLabel = {
  climate_fit: "climate fit",
  water_balance: "water balance",
  soil_nitrogen: "soil nitrogen",
  organic_matter: "organic matter",
  erosion_control: "erosion control",
  bare_exposure: "ground cover",
  pest_pressure: "pest break",
  forage_income: "forage and income",
} as const;

/** One evidence item as a sentence, for the card and for assistant answers. */
export function evidenceSentence(item: {
  indicator: string;
  value: number | string;
  comparison: string;
  source: string;
  resolution: string;
  period: string;
}): string {
  return `${item.indicator}: ${item.value} (${item.comparison}). Source: ${item.source}, ${item.resolution}, ${item.period}.`;
}
