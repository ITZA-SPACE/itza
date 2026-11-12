import type {
  Constraints,
  Field,
  Priorities,
  Rotation,
  Scenario,
  Soil,
} from "@itza/engine/contracts";

/** A field outline as GeoJSON (the bundle contract's polygon), longitude then latitude. */
export type FieldPolygon = Extract<Field["geometry"], { type: "Polygon" }>;

/** The selected field and what is derived from its outline the moment it is drawn. */
export interface FieldGeometry {
  /** The science API field id (`fieldId` in `src/data`); null until it is computed. */
  id: string | null;
  geometry: FieldPolygon;
  areaHa: number;
  /** Longitude, latitude. */
  centroid: [number, number];
  perimeterM: number;
  /** How the outline was made. */
  origin: "drawn" | "point";
}

/** A season of the field's history that the farmer confirmed or corrected (F-03). */
export interface ConfirmedSeason {
  /** Season label such as `2021-22`. */
  season: string;
  /** Crop id from the region pack, or `fallow`. */
  crop: string;
}

export interface FarmerInputs {
  /** The rotation the farmer grows now; the baseline of every comparison. */
  currentRotation: Rotation | null;
  soil: Soil;
  constraints: Constraints;
}

/** Observations by the farmer that override satellite estimates (F-20). */
export interface GroundTruth {
  /** Soil values from the farmer's own soil test; they win over the satellite or default value. */
  soilTest: Soil;
  /** Season label to the date the farmer sowed, as `YYYY-MM-DD`. */
  plantingDates: Record<string, string>;
  /** Season label to the date the farmer harvested, as `YYYY-MM-DD`. */
  harvestDates: Record<string, string>;
  /** Season label to harvested yield as entered, without units. */
  yields: Record<string, number>;
  irrigationEvents: { date: string; mm: number }[];
}

/** Everything about one field that is saved with it and put in a share link. */
export interface FieldWork {
  confirmedHistory: ConfirmedSeason[];
  inputs: FarmerInputs;
  priorities: Priorities;
  scenario: Scenario;
  groundTruth: GroundTruth;
}
