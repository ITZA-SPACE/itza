// Public API of the field data layer. Geometry helpers are shared with the map (#19).
export { loadFieldBundle } from "./defaults";
export {
  areaHa,
  centroid,
  type FieldGeometry,
  fieldId,
  perimeterM,
  roundGeometry,
} from "./geometry";
export { HERO_FIELDS, type HeroField } from "./hero";
export { createBundleLoader, defaultPeriod, type LoaderDeps } from "./loader";
export { mergeSeries } from "./merge";
export type { BundleSnapshot, LoadOptions, Period, SourceStates, SourceStatus } from "./types";
export { heroIdFor, useFieldBundle } from "./useFieldBundle";
