// Public API of @itza/knowledge: region packs (crops, pests, calendar) validated at build time.
export type { KnowledgePack } from "./generated/types.ts";
export {
  type CropEntry,
  listPacks,
  loadPack,
  type PackSummary,
  type PestEntry,
  packForLocation,
  UnknownPackError,
} from "./lookup.ts";
