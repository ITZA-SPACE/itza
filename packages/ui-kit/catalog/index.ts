// A2UI answer catalog `app-catalog/v1`: schemas, examples, validators and fallback layouts.
// Plain TypeScript with no DOM or React, so the web app and the SI gateway both import it.
export { ACTION_ALLOWLIST, type ResolvedAction, resolveAction } from "./actions";
export { EXAMPLES } from "./examples";
export {
  FALLBACK_CAPTION_KEYS,
  type FallbackOptions,
  fallbackSurface,
  INTENT_CLASSES,
  type IntentClass,
} from "./fallback";
export { checkGrounding, extractNumbers, type GroundingResult } from "./grounding";
export {
  A2UI_VERSION,
  CATALOG_ID,
  COMPONENT_NAMES,
  COMPONENT_SCHEMAS,
  type ComponentName,
  DATA_COMPONENTS,
  FOOTER_COMPONENTS,
  LAYOUT_COMPONENTS,
  LIMITS,
  MESSAGE_SCHEMA,
} from "./schemas";
export { type A2uiMessage, bind, buildSurface, DATA_PATHS } from "./surface";
export {
  type A2uiComponent,
  type Surface,
  type ValidationResult,
  validateAnswer,
} from "./validate";
