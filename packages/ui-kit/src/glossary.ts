export interface GlossaryEntry {
  /** Short label shown in running text. */
  name: string;
  /** Full term as written in PRD §14. */
  title: string;
  definition: string;
}

export const glossary = {
  ndvi: {
    name: "NDVI",
    title: "Vegetation greenness (e.g., NDVI)",
    definition: "A satellite score from 0 to 1; higher means more living plants.",
  },
  et: {
    name: "ET",
    title: "Evapotranspiration (ET)",
    definition: "Water leaving the field through soil evaporation and plant breathing.",
  },
  et0: {
    name: "ET0",
    title: "Reference ET (ET0)",
    definition: "How much water a standard grass field would use in today's weather.",
  },
  kc: {
    name: "Kc",
    title: "Crop coefficient (Kc)",
    definition: "How thirsty a crop is compared with standard grass, by growth stage.",
  },
  soilMoistureAnomaly: {
    name: "Soil moisture anomaly",
    title: "Soil moisture anomaly",
    definition: "How much wetter or drier the soil is than normal for that date.",
  },
  waterBalance: {
    name: "Water balance",
    title: "Water balance",
    definition: "Rain and stored soil water minus what the crop needs.",
  },
  frostRisk: {
    name: "Frost risk",
    title: "Frost risk",
    definition: "Chance of temperatures low enough to damage a crop at a sensitive stage.",
  },
  fallow: {
    name: "Fallow",
    title: "Fallow",
    definition: "A season when the field is left unplanted.",
  },
  seasonReplay: {
    name: "Season Replay",
    title: "Season Replay",
    definition: "Testing a rotation against real past weather to see how it would have performed.",
  },
  ssp: {
    name: "SSP",
    title: "Emissions scenario (SSP)",
    definition: "A standard climate-future storyline (low, middle or high emissions).",
  },
  managementZone: {
    name: "Management zone",
    title: "Management zone",
    definition: "A part of a field that behaves consistently differently from the rest.",
  },
  groundTruth: {
    name: "Ground truth",
    title: "Ground truth",
    definition:
      "Independently recorded facts (e.g., official crop maps) used to check ITZA's estimates.",
  },
  informationNeed: {
    name: "Information need",
    title: "Information need",
    definition:
      "A kind of data the product requires (e.g., daily rainfall), independent of which dataset provides it.",
  },
  genUi: {
    name: "Generative interface",
    title: "Generative interface (GenUI)",
    definition:
      "An assistant that answers by assembling interactive screens (charts, cards, forms) from approved building blocks, instead of replying with text only.",
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryTermId = keyof typeof glossary;
