// Public API of @itza/adapters-browser.
export { CmrAdapter, type CollectionInfo, type GranuleAvailability } from "./adapters/cmr";
export type { AdapterDeps } from "./adapters/common";
export {
  Mcd12q2Adapter,
  Mod13q1Adapter,
  Mod16a2gfAdapter,
  type PhenologyResult,
  type PhenologySeason,
} from "./adapters/ornl-modis";
export { PowerClimatologyAdapter, PowerDailyAdapter } from "./adapters/power";
export {
  GENERIC_SOIL_DEFAULTS,
  type Soil,
  SoilGridsAdapter,
  type SoilResult,
} from "./adapters/soilgrids";
export { CANONICAL_UNITS, CANONICAL_VARS, SOIL_VARS } from "./canonical";
export { HttpClient, type HttpOptions } from "./http";
export {
  type Manifest,
  parseManifest,
  type SourceEntry,
  sourcesFor,
  validateManifest,
} from "./manifest";
export { type AdapterRegistry, buildRegistry, loadRegistry } from "./registry";
export type {
  BrowserAdapter,
  CanonicalSeries,
  CanonicalVar,
  Capabilities,
  FetchRequest,
  FetchResult,
  Gap,
  Period,
} from "./types";
